const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve('assets', 'licenses');
fs.mkdirSync(dir, { recursive: true });
const packages = [
  '@coderline/alphatab',
  '@soundtouchjs/audio-worklet',
  '@soundtouchjs/core',
  '@tonejs/midi',
  'react',
  'react-dom',
  'fflate',
  'qrcode',
  'archiver',
  'adm-zip',
  'yauzl',
  'ws',
  'ffmpeg-static',
  'lucide-react',
];
const rows = [];
for (const name of packages) {
  const base = path.join('node_modules', name),
    p = JSON.parse(fs.readFileSync(path.join(base, 'package.json'))),
    dest = path.join(dir, name.replaceAll('/', '-').replaceAll('@', ''));
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs
    .readdirSync(base)
    .filter((f) => /^licen[cs]e|^copying|ffmpeg\.exe\.(README|LICENSE)$/i.test(f)))
    if (fs.statSync(path.join(base, file)).isFile())
      fs.copyFileSync(path.join(base, file), path.join(dest, file));
  rows.push(
    `${name} ${p.version} — ${p.license}\n${typeof p.repository === 'object' ? p.repository.url : p.repository || p.homepage || ''}`,
  );
}
fs.writeFileSync(
  path.join(dir, 'THIRD_PARTY_NOTICES.txt'),
  `Immerse Jam uses the following unmodified open-source components.\nCopyright and license texts are included in this directory.\n\n${rows.join('\n\n')}\n\nSCNet: backend/vendor/scnet/LICENSE\nBeat This! 1.1.0: backend/vendor/beat_this/LICENSE (MIT)\nBeat This! source: https://github.com/CPJKU/beat_this\nBeat This! pinned PyPI source and checksum: backend/vendor/beat_this/SOURCE.json\nAudio-separator, PyTorch and Python dependencies: installed with their package license files at first use.\nModel weights: downloaded separately; see each model's source and license in model catalog.\n\nalphaTab 1.8.4 source: https://github.com/CoderLine/alphaTab/tree/022a45c8e42370f9e12e68949d11eada370da83d\nSoundTouchJS 2.1.1 source: https://github.com/cutterbl/SoundTouchJS/tree/v2.1.1\nFFmpeg 6.1.1 source: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93\nFFmpeg build configuration and linked library versions: ffmpeg-static/ffmpeg.exe.README\nFFmpeg build source distribution: https://www.gyan.dev/ffmpeg/builds/\nuv source and license: https://github.com/astral-sh/uv/tree/0.13.6 (MIT OR Apache-2.0)\n`,
);

fs.copyFileSync('LICENSE', path.join(dir, 'IMMERSE_JAM_LICENSE.txt'));
fs.copyFileSync('docs/LICENSING.md', path.join(dir, 'LICENSE_SCOPE.md'));
