import { useSyncExternalStore } from 'react';
import { orderKey, readTrackOrder, subscribeTrackOrder, writeTrackOrder } from './track-order';

export default function useTrackOrder(projectId: string, scope: string) {
  const key = orderKey(projectId, scope);
  const ids = useSyncExternalStore(subscribeTrackOrder, () => readTrackOrder(key));
  return [ids, (next: string[]) => writeTrackOrder(key, next)] as const;
}
