export type InputDevice = { deviceId: string; kind: string; label: string };
export async function recordingDevices(): Promise<InputDevice[]> {
  return [
    { deviceId: 'default', kind: 'audioinput', label: '演示输入 · 预置吉他（不使用麦克风）' },
    { deviceId: 'default', kind: 'audiooutput', label: '浏览器默认输出' },
  ];
}
export { AudioCapture as NativeCapture } from './capture';
