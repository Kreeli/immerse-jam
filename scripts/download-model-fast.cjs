const fs = require('node:fs');
const crypto = require('node:crypto');
const model = require('../desktop/models.cjs').catalog.find((m) => m.id === 'roformer-sw'),
  file = '.runtime/models/roformer-sw/' + model.file,
  part = file + '.part',
  stateFile = file + '.ranges.json',
  target = file + '.parallel';
async function response(start, end) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(model.modelUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      if (r.status !== 206) throw new Error('Range status ' + r.status);
      return r;
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
(async () => {
  if (fs.existsSync(file)) return console.log('Already downloaded');
  let state;
  if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile));
  else {
    const r = await response(0, 0);
    const total = Number(r.headers.get('content-range').split('/')[1]);
    await r.arrayBuffer();
    const existing = fs.statSync(part).size;
    fs.copyFileSync(part, target);
    const chunk = Math.ceil((total - existing) / 16);
    state = {
      total,
      existing,
      ranges: Array.from({ length: 16 }, (_, i) => ({
        start: existing + i * chunk,
        end: Math.min(total - 1, existing + (i + 1) * chunk - 1),
        received: 0,
      })),
    };
    fs.writeFileSync(stateFile, JSON.stringify(state));
  }
  const fd = fs.openSync(target, 'r+');
  let last = 0;
  try {
    await Promise.all(
      state.ranges.map(async (range) => {
        if (range.start + range.received > range.end) return;
        const r = await response(range.start + range.received, range.end);
        if (!r.headers.get('content-range')?.startsWith(`bytes ${range.start + range.received}-`))
          throw new Error('Wrong range');
        for await (const chunk of r.body) {
          if (range.start + range.received + chunk.length > range.end + 1)
            throw new Error('Oversize range');
          fs.writeSync(fd, chunk, 0, chunk.length, range.start + range.received);
          range.received += chunk.length;
          if (Date.now() - last > 5000) {
            last = Date.now();
            fs.writeFileSync(stateFile, JSON.stringify(state));
            console.log(
              Math.round(
                (state.existing + state.ranges.reduce((sum, r) => sum + r.received, 0)) / 1048576,
              ) +
                ' / ' +
                Math.round(state.total / 1048576) +
                ' MB',
            );
          }
        }
        if (range.start + range.received !== range.end + 1) throw new Error('Incomplete range');
        fs.writeFileSync(stateFile, JSON.stringify(state));
      }),
    );
  } finally {
    fs.closeSync(fd);
  }
  if (fs.statSync(target).size !== state.total) throw new Error('Size mismatch');
  const hash = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(target)) hash.update(b);
  console.log('SHA256', hash.digest('hex'));
  fs.renameSync(target, file);
  console.log('DONE');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
