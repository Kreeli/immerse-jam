import { useSyncExternalStore } from 'react';
import type { Project, RecordingSettings } from '../shared/types';
export type AudioDefaults = Omit<RecordingSettings, 'mode'>;
export const DEFAULT_AUDIO: AudioDefaults = {
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  channel: 'stereo',
  latencyMs: 0,
};
const listeners = new Set<() => void>();
let calibrationRoute = '';
export function calibrationKey(input: string, output: string) {
  return (
    'immerse.recording.latency.' +
    input +
    '|' +
    output +
    (calibrationRoute ? '|' + calibrationRoute : '')
  );
}
export function setCalibrationRoute(route: string) {
  if (route === calibrationRoute) return;
  calibrationRoute = route;
  defaults = calibratedAudio({ ...defaults, latencyMs: 0 });
  listeners.forEach((fn) => fn());
}
export function validateAudio(value: Partial<AudioDefaults>): AudioDefaults {
  const next = { ...DEFAULT_AUDIO, ...value };
  if (
    typeof next.inputDeviceId !== 'string' ||
    typeof next.outputDeviceId !== 'string' ||
    !['stereo', 'left', 'right', 'mono'].includes(next.channel) ||
    !Number.isFinite(next.latencyMs) ||
    Math.abs(next.latencyMs) > 2000
  )
    throw new Error('录音设置无效，延迟校正需要在-2000至2000毫秒之间');
  return {
    inputDeviceId: next.inputDeviceId,
    outputDeviceId: next.outputDeviceId,
    channel: next.channel,
    latencyMs: next.latencyMs,
  };
}
let defaults = DEFAULT_AUDIO;
try {
  defaults = validateAudio(JSON.parse(localStorage.getItem('immerse.audio.defaults') || '{}'));
} catch {}
export function getAudioDefaults() {
  return defaults;
}
export function calibratedAudio(value: AudioDefaults): AudioDefaults {
  try {
    const saved = localStorage.getItem(calibrationKey(value.inputDeviceId, value.outputDeviceId));
    if (
      saved !== null &&
      saved.trim() &&
      Number.isFinite(Number(saved)) &&
      Math.abs(Number(saved)) <= 2000
    )
      return { ...value, latencyMs: Number(saved) };
  } catch {}
  return value;
}
export function setAudioDefaults(patch: Partial<AudioDefaults>) {
  let next = validateAudio({ ...defaults, ...patch });
  if (
    (patch.inputDeviceId !== undefined || patch.outputDeviceId !== undefined) &&
    patch.latencyMs === undefined
  )
    next = calibratedAudio({ ...next, latencyMs: 0 });
  const key =
      patch.latencyMs === undefined
        ? null
        : calibrationKey(next.inputDeviceId, next.outputDeviceId),
    previousCalibration = key ? localStorage.getItem(key) : null;
  if (key) localStorage.setItem(key, String(next.latencyMs));
  try {
    localStorage.setItem('immerse.audio.defaults', JSON.stringify(next));
  } catch (error) {
    if (key) {
      if (previousCalibration === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previousCalibration);
    }
    throw error;
  }
  defaults = next;
  listeners.forEach((fn) => fn());
}
export function rememberCalibration(value: AudioDefaults, latencyMs: number) {
  validateAudio({ ...value, latencyMs });
  localStorage.setItem(
    calibrationKey(value.inputDeviceId, value.outputDeviceId),
    String(latencyMs),
  );
}
export function effectiveRecordingSettings(project: Project): RecordingSettings {
  return {
    ...calibratedAudio(defaults),
    ...project.recordingSettings,
    mode:
      project.kind === 'practice'
        ? project.practiceMode || 'instrument'
        : project.recordingSettings?.mode || 'instrument',
  };
}
export function useAudioDefaults() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, getAudioDefaults);
}
