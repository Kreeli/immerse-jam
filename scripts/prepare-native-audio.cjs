const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = path.join(root, '.runtime', 'native-audio');
const cache = path.join(root, '.runtime', 'dev-cache');
const localDotnet = path.join(cache, 'dotnet10', 'sdk', 'dotnet.exe');
const dotnet = process.env.IMMERSE_DOTNET || (fs.existsSync(localDotnet) ? localDotnet : 'dotnet');
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('The native audio host is built on Windows x64.');
const env = {
  ...process.env,
  DOTNET_CLI_HOME: path.join(cache, 'dotnet-home'),
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
  NUGET_PACKAGES: path.join(cache, 'nuget'),
  NUGET_HTTP_CACHE_PATH: path.join(cache, 'nuget-http'),
  TEMP: path.join(root, '.runtime', 'audit-temp'),
  TMP: path.join(root, '.runtime', 'audit-temp'),
};
function run(executable, args, capture = false) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    windowsHide: true,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || 'Native audio build failed.');
  return result.stdout || '';
}
const sdks = run(dotnet, ['--list-sdks'], true);
if (!/^10\./m.test(sdks))
  throw new Error('Install a .NET 10 SDK on the development drive or set IMMERSE_DOTNET.');
const runtimes = run(dotnet, ['--list-runtimes'], true);
const matches = [...runtimes.matchAll(/^Microsoft\.NETCore\.App (10\.\d+\.\d+) \[(.+)\]$/gm)].sort(
  (a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }),
);
if (!matches.length) throw new Error('The selected SDK has no .NET 10 runtime.');
const [, runtimeVersion, runtimeParent] = matches.at(-1);
const runtimeRoot = path.resolve(runtimeParent, '..', '..');
const sources = [
  'desktop/native-audio/Program.cs',
  'desktop/native-audio/ImmerseAudioHost.csproj',
  'desktop/native-audio/NuGet.config',
  'desktop/native-audio/NAudio-LICENSE.txt',
  'scripts/prepare-native-audio.cjs',
];
const hash = crypto.createHash('sha256');
for (const file of sources) hash.update(fs.readFileSync(path.join(root, file)));
hash.update(runtimeVersion);
const revision = hash.digest('hex').slice(0, 20);
const output = path.join(base, 'versions', revision);
const assembly = path.join(output, 'ImmerseAudioHost.dll');
const runtimeExe = path.join(output, 'dotnet.exe');
if (!fs.existsSync(path.join(output, 'complete.json'))) {
  fs.mkdirSync(output, { recursive: true });
  run(dotnet, [
    'publish',
    'desktop/native-audio/ImmerseAudioHost.csproj',
    '-c',
    'Release',
    '-o',
    output,
    '--self-contained',
    'false',
    '--configfile',
    'desktop/native-audio/NuGet.config',
    '-p:BaseIntermediateOutputPath=' + path.join(base, 'obj') + path.sep,
    '-p:MSBuildProjectExtensionsPath=' + path.join(base, 'obj') + path.sep,
    '-p:BaseOutputPath=' + path.join(base, 'bin') + path.sep,
  ]);
  fs.copyFileSync(path.join(runtimeRoot, 'dotnet.exe'), runtimeExe);
  fs.cpSync(
    path.join(runtimeRoot, 'host', 'fxr', runtimeVersion),
    path.join(output, 'host', 'fxr', runtimeVersion),
    { recursive: true },
  );
  fs.cpSync(
    path.join(runtimeParent, runtimeVersion),
    path.join(output, 'shared', 'Microsoft.NETCore.App', runtimeVersion),
    { recursive: true },
  );
  const licenses = path.join(output, 'licenses');
  fs.mkdirSync(licenses, { recursive: true });
  fs.copyFileSync(
    path.join(root, 'desktop', 'native-audio', 'NAudio-LICENSE.txt'),
    path.join(licenses, 'NAudio.txt'),
  );
  for (const name of ['LICENSE.txt', 'ThirdPartyNotices.txt'])
    fs.copyFileSync(path.join(runtimeRoot, name), path.join(licenses, 'DotNET-' + name));
  run(runtimeExe, [assembly, '--self-test']);
  fs.writeFileSync(
    path.join(output, 'complete.json'),
    JSON.stringify({ revision, runtimeVersion, naudio: '2.2.1' }, null, 2),
  );
}
fs.mkdirSync(base, { recursive: true });
fs.writeFileSync(path.join(base, 'current.json'), JSON.stringify({ revision }, null, 2));
// This package staging folder is not used by the running development host.
fs.cpSync(output, path.join(base, 'package'), { recursive: true });
console.log('Native audio host ready: ' + output);
