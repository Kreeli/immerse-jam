import type { Model } from '../../shared/types';
export function compatible(model: Model, mode: string) {
  const required =
    mode === 'six'
      ? ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']
      : mode === 'basic'
        ? ['vocals', 'drums', 'bass']
        : mode === 'guitarist'
          ? ['guitar']
          : mode === 'singer'
            ? ['vocals']
            : mode === 'drummer'
              ? ['drums']
              : ['bass'];
  return required.every((s) => model.stems.includes(s));
}
