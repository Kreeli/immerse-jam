const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { contained } = require('./store.cjs');
const {
  validateProject,
  referencedFiles,
  repairLegacyAnalysis,
} = require('../shared/project-validation.cjs');
async function sha(file, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest('hex');
}
async function pack(store, id, dest, full = false) {
  const project = store.get(id),
    files = new Set([
      project.original,
      ...project.tracks.map((t) => t.file),
      ...(project.results || []).flatMap((result) => result.tracks.map((track) => track.file)),
      ...(project.sourceGroups || []).flatMap((group) => group.tracks.map((track) => track.file)),
      ...(full || project.kind === 'creation'
        ? (project.takes || []).flatMap((t) => [t.file, ...(t.rawFile ? [t.rawFile] : [])])
        : []),
      ...(full ? project.attachments.map((a) => a.file) : []),
      ...(full && project.scoreMidi ? [project.scoreMidi] : []),
    ]);
  const manifest = {
    ...project,
    schemaVersion:
      project.kind === 'creation' && (project.sessionSource || project.sourceGroups?.length)
        ? 2
        : project.schemaVersion,
    attachments: full ? project.attachments : [],
    ...(full
      ? {}
      : {
          analysis: null,
          alignment: null,
          bookmarks: [],
          chordCharts: [],
          activeChordChartId: null,
          ...(project.kind === 'creation' ? {} : { takes: [], selectedTakeIds: [] }),
        }),
  };
  delete manifest.recordingSettings;
  delete manifest.playback;
  delete manifest.scoreMidi;
  if (full && project.scoreMidi) manifest.scoreMidi = project.scoreMidi;
  for (const file of referencedFiles(manifest)) files.add(file);
  const virtual = {};
  for (const result of project.results || [])
    virtual[result.directory + '/result.json'] = JSON.stringify({
      ...result,
      tracks: result.tracks.map((track) => ({
        ...track,
        file: 'tracks/' + path.basename(track.file),
      })),
    });
  const hashes = {};
  for (const file of files) hashes[file] = await sha(store.asset(id, file));
  for (const [file, content] of Object.entries(virtual))
    hashes[file] = crypto.createHash('sha256').update(content).digest('hex');
  const archive = require('archiver')('zip', { store: true }),
    output = fs.createWriteStream(dest);
  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);
  archive.append(JSON.stringify(manifest), { name: 'project.json' });
  archive.append(JSON.stringify(hashes), { name: 'checksums.json' });
  for (const file of files)
    archive.file(store.asset(id, file), { name: file.replaceAll('\\', '/') });
  for (const [file, content] of Object.entries(virtual)) archive.append(content, { name: file });
  await archive.finalize();
  await done;
  return dest;
}
function extract(file, dir, { signal, onProgress = () => {} } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new (require('node:worker_threads').Worker)(
      path.join(__dirname, 'archive-worker.cjs'),
      { workerData: { file, dir } },
    );
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(dir);
    };
    const cancel = () => void worker.terminate().then(() => finish(new Error('导入已取消')));
    signal?.addEventListener('abort', cancel, { once: true });
    worker.on('message', (data) => {
      if (data.error) finish(new Error(data.error));
      else if (data.done) finish();
      else onProgress(data.progress);
    });
    worker.on('error', finish);
    worker.on('exit', (code) => {
      if (!settled) finish(new Error('解包已中断 (' + code + ')'));
    });
  });
}
function extractLocal(file, dir, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(file, 'r');
    let closed = false;
    const close = () => {
      if (!closed) {
        closed = true;
        fs.closeSync(fd);
      }
    };
    require('yauzl').open(file, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err) {
        close();
        return reject(err);
      }
      let count = 0,
        total = 0,
        failed = false;
      const fail = (e) => {
        if (failed) return;
        failed = true;
        zip.close();
        close();
        reject(e);
      };
      zip.on('error', fail);
      zip.on('end', () => {
        close();
        resolve(dir);
      });
      zip.on('entry', (entry) => {
        try {
          if (
            ++count > 6000 ||
            (total += entry.uncompressedSize) > 16 * 1024 ** 3 ||
            entry.uncompressedSize > 2 * 1024 ** 3
          )
            throw new Error('压缩包内容超过允许大小');
          if (
            /^(project|manifest|checksums)\.json$/.test(entry.fileName) &&
            entry.uncompressedSize > 16 * 1024 ** 2
          )
            throw new Error('歌曲清单过大');
          if (/^[A-Za-z]:|^[/\\]/.test(entry.fileName)) throw new Error('压缩包包含绝对路径');
          const target = contained(dir, entry.fileName);
          if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
            throw new Error('压缩包不允许包含符号链接');
          if (/\/$/.test(entry.fileName)) {
            fs.mkdirSync(target, { recursive: true });
            zip.readEntry();
            return;
          }
          if (![0, 8].includes(entry.compressionMethod)) throw new Error('不支持的压缩格式');
          if (entry.generalPurposeBitFlag & 1) throw new Error('不支持加密项目包');
          const header = Buffer.alloc(30);
          fs.readSync(fd, header, 0, 30, entry.relativeOffsetOfLocalHeader);
          if (header.readUInt32LE(0) !== 0x04034b50) throw new Error('损坏的压缩包');
          let pos =
            entry.relativeOffsetOfLocalHeader +
            30 +
            header.readUInt16LE(26) +
            header.readUInt16LE(28);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const output = fs.openSync(target, 'wx');
          let written = 0,
            crc = 0;
          const write = (data) => {
            fs.writeSync(output, data);
            written += data.length;
            crc = require('node:zlib').crc32(data, crc);
            if (written > entry.uncompressedSize) throw new Error('解压大小与清单不符');
          };
          try {
            const inflate =
              entry.compressionMethod === 8
                ? new (require('fflate').Inflate)((chunk) => write(chunk))
                : null;
            let remaining = entry.compressedSize;
            while (remaining > 0) {
              const size = Math.min(65536, remaining),
                data = Buffer.allocUnsafe(size);
              const n = fs.readSync(fd, data, 0, size, pos);
              if (n !== size) throw new Error('压缩包意外截断');
              pos += size;
              remaining -= size;
              if (inflate) inflate.push(data, remaining === 0);
              else write(data);
            }
            if (written !== entry.uncompressedSize || crc !== entry.crc32)
              throw new Error('文件解压校验失败');
          } finally {
            fs.closeSync(output);
          }
          onProgress(count / Math.max(count, zip.entryCount));
          setImmediate(() => zip.readEntry());
        } catch (error) {
          fail(error);
        }
      });
      zip.readEntry();
    });
  });
}
async function importArchive(store, file, options = {}) {
  const parent = path.resolve(store.base, 'incoming'),
    staging = contained(parent, crypto.randomUUID());
  fs.mkdirSync(staging, { recursive: true });
  let destination;
  try {
    await extract(file, staging, options);
    let project, hashes;
    if (fs.existsSync(path.join(staging, 'project.json'))) {
      project = JSON.parse(fs.readFileSync(path.join(staging, 'project.json')));
      if (
        ![1, 2].includes(project.schemaVersion) ||
        !project.original ||
        !Array.isArray(project.tracks)
      )
        throw new Error('不支持的歌曲项目格式');
      hashes = JSON.parse(fs.readFileSync(path.join(staging, 'checksums.json')));
      for (const [name, expected] of Object.entries(hashes)) {
        options.signal?.throwIfAborted();
        if (
          !/^[a-f0-9]{64}$/.test(expected) ||
          (await sha(contained(staging, name), options.signal)) !== expected
        )
          throw new Error('歌曲文件校验失败');
      }
    } else if (fs.existsSync(path.join(staging, 'manifest.json'))) {
      const m = JSON.parse(fs.readFileSync(path.join(staging, 'manifest.json'), 'utf8'));
      project = fromAudioJam(m, staging);
    } else throw new Error('未发现可识别的歌曲清单');
    repairLegacyAnalysis(project);
    validateProject(project);
    require('./groups.cjs').validateGroups(project);
    if (project.takes) {
      require('./takes.cjs').validateTakes(project.takes);
      require('./takes.cjs').validateSelection(project);
    }
    if (project.chordCharts) require('./charts.cjs').validateCharts(project.chordCharts);
    const files = [
      project.original,
      ...project.tracks.map((t) => t.file),
      ...(project.results || []).flatMap((result) => result.tracks.map((track) => track.file)),
      ...(project.takes || []).flatMap((t) => [t.file, ...(t.rawFile ? [t.rawFile] : [])]),
      ...(project.sourceGroups || []).flatMap((group) => group.tracks.map((track) => track.file)),
      ...(project.attachments || []).map((a) => a.file),
      ...(project.scoreMidi ? [project.scoreMidi] : []),
    ];
    for (const name of files) {
      if (!fs.statSync(contained(staging, name)).isFile()) throw new Error('项目缺少媒体文件');
    }
    for (const name of referencedFiles(project)) {
      if (hashes && !Object.hasOwn(hashes, name))
        throw new Error('媒体文件未包含在校验清单中：' + name);
      if (!fs.statSync(contained(staging, name)).isFile()) throw new Error('项目缺少媒体文件');
    }
    const origin = project.originId || project.id;
    options.signal?.throwIfAborted();
    const duplicate = store.list().find((p) => p.originId === origin);
    if (duplicate) return { ...duplicate, duplicate: true };
    project.id = crypto.randomUUID();
    project.originId = origin;
    project.updatedAt = new Date().toISOString();
    project.createdAt = project.createdAt || project.updatedAt;
    project.schemaVersion =
      project.sourceGroups?.length || (project.kind === 'creation' && project.sessionSource)
        ? 2
        : 1;
    destination = store.dir(project.id);
    fs.renameSync(staging, destination);
    return store.save(project);
  } catch (error) {
    if (destination && path.dirname(destination) === path.resolve(store.projects))
      fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally {
    if (path.dirname(staging) === parent && fs.existsSync(staging))
      fs.rmSync(staging, { recursive: true, force: true });
  }
}
function fromAudioJam(m, root) {
  const main = m.tracks?.find((t) => t.name === 'main');
  if (!main?.audio_file) throw new Error('Audio Jam 项目缺少原曲');
  const asset = (name) => 'assets/' + path.basename(name);
  const tracks = (m.tracks || [])
    .filter((t) => t.name !== 'main')
    .map((t) => ({
      id: t.name,
      name: t.name,
      file: asset(t.audio_file),
      gain: (t.volume ?? 100) / 100,
      pan: 0,
      mute: !!t.mute,
      solo: !!t.solo,
    }));
  const attachments = (m.attachments || [])
    .filter((a) => a.file && fs.existsSync(contained(root, asset(a.file))))
    .map((a) => ({
      id: crypto.randomUUID(),
      name: a.name,
      file: asset(a.file),
      legacyRemark: a.remark,
    }));
  let analysis;
  if (m.beatInfoId) {
    const f = contained(root, asset(m.beatInfoId + '.json'));
    if (fs.existsSync(f)) {
      const b = JSON.parse(fs.readFileSync(f));
      const chords = b.chordAdvanced || b.chordStandard || [];
      analysis = {
        bpm: b.tempo?.[0] || m.bpm,
        key: b.key || m.key,
        beats: (b.beatTimes || []).map((x) => x.time),
        chords: chords.map((c, i) => ({
          start: c.chordTime,
          end: chords[i + 1]?.chordTime || m.duration / 1000,
          label: c.chordName,
          confidence: 1,
        })),
        method: 'audiojam-migration',
      };
    }
  }
  return {
    schemaVersion: 1,
    id: m.id,
    title: m.name,
    artist: m.artist || '',
    original: asset(main.audio_file),
    duration: (m.duration || 0) / 1000,
    tracks,
    attachments,
    bookmarks: (m.position_marks || []).map((b) => ({
      id: b.id,
      title: b.title,
      start: b.start / 1000,
      ...(b.end ? { end: b.end / 1000 } : {}),
    })),
    analysis,
    practice: {
      tempo: main.speed || 1,
      pitch: main.pitch_key || 0,
      master: 0.8,
      eq: [0, 0, 0],
      metronome: !!m.metronome,
    },
    createdAt: new Date(m.create_time || Date.now()).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
module.exports = { pack, extract, extractLocal, importArchive, fromAudioJam, sha };
