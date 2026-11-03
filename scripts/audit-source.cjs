const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .toString()
      .split('\0')
      .filter(Boolean),
  ),
].filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
const errors = [];
for (const file of files) {
  const publicDemoAudio =
    /^docs\/site\/assets\/audio\/fabulous-rehearsal\/(original|vocals|drums|bass|piano|guitar|other)\.mp3$/.test(
      file,
    );
  if (
    /^(\.runtime|\.research|release|dist(?:-android)?|node_modules|test-output|pic|zz-build)\//.test(
      file,
    ) ||
    /^(?:probe-[^/]*\.txt|docs\/zz-probe\.md)$/.test(file) ||
    (/\.(wav|mp3|flac|aum|ijam|ckpt|onnx|safetensors|exe)$/i.test(file) && !publicDemoAudio)
  )
    errors.push(file + ': private/generated binary must not be committed');
  const data = fs.readFileSync(file);
  if (data.length > 8 * 1024 ** 2) errors.push(file + ': unexpected large source artifact');
  if (!/\.(png|ico|jpe?g|ttf|woff2?|mp3)$/.test(file)) {
    const content = data.toString();
    if (
      /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
        content,
      )
    )
      errors.push(file + ': possible credential');
    if (/[CD]:[\\/]Users[\\/](?!Public\b|<)[^\s"']+/i.test(content))
      errors.push(file + ': personal absolute path');
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  'Source audit passed:',
  files.length,
  'files; only declared public demo audio allowed; no private runtime, model weights or credential patterns.',
);
