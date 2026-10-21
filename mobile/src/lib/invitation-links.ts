import { URL } from 'react-native-url-polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'spotted.pending-invitation.v1';
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve();
export interface PendingInvitation { code: string; expires: number; owner: string | null }
export const normalizeInvitationCode = (value: string): string | null => {
  const code = value.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null;
};
export function invitationCodeFromLink(path: string): string | null {
  try {
    const url = new URL(path, 'spotted://app');
    if (url.username || url.password || url.port) return null;
    if (url.protocol !== 'spotted:' && !(url.protocol === 'https:' && url.hostname === 'spottedsocial.vercel.app')) return null;
    const route = url.protocol === 'spotted:' && url.hostname !== 'app' ? `/${url.hostname}${url.pathname}` : url.pathname;
    const match = /^\/invite\/([^/]+)\/?$/.exec(route);
    return match ? normalizeInvitationCode(decodeURIComponent(match[1])) : null;
  } catch { return null; }
}
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = writes.then(action);
  writes = result.catch(() => {});
  return result;
}
async function read(): Promise<PendingInvitation | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (normalizeInvitationCode(value.code) === value.code && Number.isFinite(value.expires) && value.expires > Date.now()
      && (value.owner === null || typeof value.owner === 'string')) return value;
  } catch { /* invalid storage is discarded */ }
  await AsyncStorage.removeItem(KEY);
  return null;
}
export async function rememberInvitation(code: string): Promise<void> {
  const normalized = normalizeInvitationCode(code);
  if (!normalized) return;
  await serialized(() => AsyncStorage.setItem(KEY, JSON.stringify({ code: normalized, expires: Date.now() + 7 * 86400_000, owner: null })));
  for (const listener of listeners) listener();
}
/** Bind to the first signed-in account, including while admission is pending. */
export function claimInvitation(userId: string): Promise<PendingInvitation | null> {
  return serialized(async () => {
    const value = await read();
    if (!value) return null;
    if (value.owner && value.owner !== userId) { await AsyncStorage.removeItem(KEY); return null; }
    const claimed = { ...value, owner: userId };
    await AsyncStorage.setItem(KEY, JSON.stringify(claimed));
    return claimed;
  });
}
export function clearInvitation(code: string, owner: string): Promise<void> {
  return serialized(async () => {
    const value = await read();
    if (value?.code === code && value.owner === owner) await AsyncStorage.removeItem(KEY);
  });
}
export const subscribeInvitations = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
