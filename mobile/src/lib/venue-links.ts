import { URL } from 'react-native-url-polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isUuid } from './plan-navigation';
const key = 'spotted.pending-venue.v1';
const listeners = new Set<() => void>();
let operations: Promise<unknown> = Promise.resolve();
function ordered<T>(work: () => Promise<T>): Promise<T> {
  const result = operations.then(work, work);
  operations = result.catch(() => undefined);
  return result;
}
export function venueIdFromLink(path: string): string | null {
  try {
    const url = new URL(path, 'spotted://app');
    const route = url.protocol === 'spotted:' && url.hostname !== 'app' ? `/${url.hostname}${url.pathname}` : url.pathname;
    if (!['spotted:', 'https:'].includes(url.protocol) || (url.protocol === 'https:' && url.hostname !== 'spottedsocial.vercel.app')) return null;
    if (route !== '/venue-link') return null;
    const id = url.searchParams.get('venueId');
    return isUuid(id) ? id : null;
  } catch { return null; }
}
export function rememberSharedVenue(id: string): Promise<void> {
  return ordered(async () => {
    if (!isUuid(id)) return;
    await AsyncStorage.setItem(key, JSON.stringify({ id, expires: Date.now() + 7 * 86400_000 }));
    for (const listener of listeners) listener();
  });
}
export const subscribeSharedVenue = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** A cancelled auth/navigation handoff must leave the destination for the next mount. */
export function consumeSharedVenue(accept: (id: string) => boolean = () => true): Promise<string | null> {
  return ordered(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    let value: { id?: unknown; expires?: number };
    try { value = JSON.parse(raw); } catch { await AsyncStorage.removeItem(key); return null; }
    if (!value || !isUuid(value.id) || typeof value.expires !== 'number' || value.expires <= Date.now()) {
      await AsyncStorage.removeItem(key); return null;
    }
    if (!accept(value.id)) return null;
    await AsyncStorage.removeItem(key);
    return value.id;
  });
}
