import { useSyncExternalStore } from 'react';
import { setCalibrationRoute } from './device-preferences';
export const AUDIO_SYSTEMS = [
  'web-audio',
  'wasapi',
  'wasapi-exclusive',
  'wasapi-low-latency',
  'directsound',
  'asio',
] as const;
export const SAMPLE_RATES = [44100, 48000, 88200, 96000] as const;
export type AudioSystem = (typeof AUDIO_SYSTEMS)[number];
export type AudioEnginePreferences = { backend: AudioSystem; deviceId: string; sampleRate: number };
export type NativeAudioDevice = {
  backend: AudioSystem;
  deviceId: string;
  name: string;
  isDefault: boolean;
  deviceSampleRate: number | null;
};
export type NativeAudioInfo = {
  available: boolean;
  devices: NativeAudioDevice[];
  reason?: string;
  errors?: string[];
};
export type AudioOutputState = {
  backend: AudioSystem;
  sampleRate: number;
  deviceSampleRate?: number;
  deviceBufferFrames?: number;
};
export const DEFAULT_ENGINE: AudioEnginePreferences = {
  backend: 'web-audio',
  deviceId: 'default',
  sampleRate: 48000,
};
export function validateEngine(value: AudioEnginePreferences): AudioEnginePreferences {
  if (
    !value ||
    !AUDIO_SYSTEMS.includes(value.backend) ||
    !SAMPLE_RATES.includes(value.sampleRate as 48000) ||
    typeof value.deviceId !== 'string' ||
    !value.deviceId ||
    value.deviceId.length > 2048 ||
    value.deviceId.includes('\0') ||
    (value.backend === 'asio' && value.deviceId === 'default')
  )
    throw new Error('音频系统、设备或采样率无效');
  return { backend: value.backend, deviceId: value.deviceId, sampleRate: value.sampleRate };
}
let preferences = DEFAULT_ENGINE;
try {
  preferences = validateEngine(JSON.parse(localStorage.getItem('immerse.audio.engine') || 'null'));
} catch {}
const listeners = new Set<() => void>();
const routeKey = (value: AudioEnginePreferences) =>
  value.backend === 'web-audio' && value.sampleRate === 48000
    ? ''
    : value.backend + ':' + value.deviceId + ':' + value.sampleRate;
setCalibrationRoute(routeKey(preferences));
export function getEnginePreferences() {
  return preferences;
}
export function setEnginePreferences(value: AudioEnginePreferences) {
  const next = validateEngine(value);
  localStorage.setItem('immerse.audio.engine', JSON.stringify(next));
  preferences = next;
  setCalibrationRoute(routeKey(next));
  listeners.forEach((fn) => fn());
}
export function useEnginePreferences() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, getEnginePreferences);
}
