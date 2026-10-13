import { isDemoMode } from './demo-mode';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import type { DmMessage } from './dm';
import { supabase } from './supabase';
import { isFromTonight } from './tonight';
import { getSessionUserId, getSessionRevision } from './session-identity';

export type PendingDm = DmMessage & { localAsset?: string; failed?: boolean };
const key = (uid: string, thread: string) => `spotted.pending-dm.v1.${uid}.${thread}`;
const writes = new Map<string, Promise<unknown>>();
export function pendingDm(userId: string, threadId: string, text: string, image: string | null = null): PendingDm {
  return { id: randomUUID(), thread_id: threadId, sender_id: userId, text, image_url: image, created_at: new Date().toISOString() };
}
export async function readPendingDm(userId: string, threadId: string): Promise<PendingDm[]> {
  if (isDemoMode()) return [];
  try {
    const value = JSON.parse(await AsyncStorage.getItem(key(userId, threadId)) ?? '[]');
    return Array.isArray(value) ? value.filter(m => m.sender_id === userId && m.thread_id === threadId && isFromTonight(m.created_at)).map(m => ({ ...m, failed: true })) : [];
  } catch { return []; }
}
export function savePendingDm(userId: string, threadId: string, rows: PendingDm[]): Promise<unknown> {
  if (isDemoMode()) return Promise.resolve();
  const revision = getSessionRevision();
  const k = key(userId, threadId);
  const next = (writes.get(k) ?? Promise.resolve()).catch(() => {}).then(() => {
    if (getSessionUserId() !== userId || getSessionRevision() !== revision) return;
    return rows.length ? AsyncStorage.setItem(k, JSON.stringify(rows)) : AsyncStorage.removeItem(k);
  });
  writes.set(k, next);
  void next.finally(() => { if (writes.get(k) === next) writes.delete(k); }).catch(() => {});
  return next;
}
export async function clearPendingDms(userId: string): Promise<void> {
  await Promise.allSettled([...writes.values()]);
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`spotted.pending-dm.v1.${userId}.`));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
export async function deliverDm(message: PendingDm): Promise<DmMessage> {
  if (getSessionUserId() !== message.sender_id) throw new Error('Account changed');
  if (!isFromTonight(message.created_at)) throw new Error('Message expired');
  const { data, error } = await supabase.rpc('send_dm_once', { p_id: message.id, p_thread: message.thread_id, p_text: message.text, p_image: message.image_url });
  if (error) throw error;
  if (getSessionUserId() !== message.sender_id) throw new Error('Account changed');
  if (!data?.[0]) throw new Error('Message not confirmed');
  return data[0] as DmMessage;
}
