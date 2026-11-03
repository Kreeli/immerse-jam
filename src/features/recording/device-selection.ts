import type { RecordingSettings } from '../../shared/types';
type Device = { kind: string; deviceId: string; label: string };
/** Do not treat a permission-hidden device list as proof that a saved device is gone. */
export function reconcileRecordingDevices(settings: RecordingSettings, devices: Device[]) {
  const missing = (kind: string, id: string) =>
    id !== 'default' &&
    devices.some((d) => d.kind === kind && d.deviceId && d.label) &&
    !devices.some((d) => d.kind === kind && d.deviceId === id);
  const input = missing('audioinput', settings.inputDeviceId),
    output = missing('audiooutput', settings.outputDeviceId);
  return {
    changed: input || output,
    settings: {
      ...settings,
      inputDeviceId: input ? 'default' : settings.inputDeviceId,
      outputDeviceId: output ? 'default' : settings.outputDeviceId,
      latencyMs: input || output ? 0 : settings.latencyMs,
    },
  };
}
