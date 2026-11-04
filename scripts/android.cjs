const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  os = require('node:os');
const root = path.resolve(__dirname, '..'),
  android = path.join(root, 'platforms/android');
const configFile = path.join(root, '.runtime/android/config.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const sdk =
  process.env.ANDROID_HOME || config.sdk || path.join(os.homedir(), 'AppData/Local/Android/Sdk');
const java = process.env.JAVA_HOME || config.java;
if (!java || !fs.existsSync(path.join(java, 'bin/java.exe')))
  throw new Error(
    'Set JAVA_HOME to the Android Studio jbr folder, or .runtime/android/config.json java.',
  );
fs.writeFileSync(
  path.join(android, 'local.properties'),
  'sdk.dir=' + sdk.replaceAll('\\', '/') + '\n',
);
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk };
const action = process.argv[2] || 'assembleDebug';
function run(exe, args, cwd = root) {
  const result = cp.spawnSync(exe, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: exe.endsWith('.bat'),
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (action !== 'wrapper') {
  run(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    'build',
    '--mode',
    'android',
  ]);
  const target = path.join(android, 'app/src/main/assets/web');
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(root, 'dist-android'), target, { recursive: true });
  fs.cpSync(
    path.join(root, 'node_modules/@coderline/alphatab/dist/font'),
    path.join(target, 'alphatab/font'),
    { recursive: true },
  );
  fs.mkdirSync(path.join(android, 'app/src/main/res/drawable'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'assets/app-icon.png'),
    path.join(android, 'app/src/main/res/drawable/app_icon.png'),
  );
  fs.copyFileSync(
    path.join(root, 'shared/ipc-methods.json'),
    path.join(android, 'app/src/main/assets/ipc-methods.json'),
  );
  // Remove generated models from an earlier inference build.
  const generated = path.resolve(android, 'app/src/main/assets/models');
  if (!generated.startsWith(path.resolve(android, 'app/src/main/assets') + path.sep))
    throw new Error('Invalid generated path');
  fs.rmSync(generated, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'assets/licenses'), path.join(android, 'app/src/main/assets/legal'), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(root, 'platforms/android/THIRD_PARTY_NOTICES.md'),
    path.join(android, 'app/src/main/assets/legal/ANDROID_NOTICES.md'),
  );
  for (const notice of ['Apache-2.0.txt', 'ZXing-NOTICE.txt'])
    fs.copyFileSync(
      path.join(android, notice),
      path.join(android, 'app/src/main/assets/legal', notice),
    );
}
if (!/^[a-zA-Z][a-zA-Z0-9:]*$/.test(action)) throw new Error('Invalid Gradle task');
const wrapper = path.join(android, 'gradle/wrapper/gradle-wrapper.jar');
if (fs.existsSync(wrapper))
  run(
    path.join(java, 'bin/java.exe'),
    [
      '-classpath',
      wrapper,
      'org.gradle.wrapper.GradleWrapperMain',
      action,
      '--console=plain',
      '--no-daemon',
    ],
    android,
  );
else {
  if (!config.gradle) throw new Error('Gradle wrapper unavailable');
  run('"' + config.gradle + '"', [action, '--console=plain', '--no-daemon'], android);
}
