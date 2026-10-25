import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchRpc } from './launch';

export type NominationStatus = 'waiting' | 'ready' | 'invited' | 'joining' | 'joined' | 'paused' | 'unavailable';
export interface NominationProgress { id: string; slot: number; phone: string; status: NominationStatus }
export const NOMINATION_LABELS: Record<NominationStatus, string> = {
  waiting: 'Waiting for a wave', ready: 'Place unlocked', invited: 'Invited',
  joining: 'Joining', joined: 'Joined', paused: 'Wave paused', unavailable: 'Invitation unavailable',
};
export type NomineeLabels = Record<string, { phone: string; name: string }>;
const labelKey = (userId: string, slot: number) => `spotted:nominee-label:${userId}:${slot}`;

/** Selected-contact names never leave this device and never cross accounts. */
export async function saveNomineeLabel(userId: string, slot: number, phone: string, name: string) {
  try { await AsyncStorage.setItem(labelKey(userId, slot), JSON.stringify({ phone, name: name.trim().slice(0, 80) })); } catch { /* Number remains the fallback. */ }
}
export async function readNomineeLabels(userId: string): Promise<NomineeLabels> {
  const labels: NomineeLabels = {};
  await Promise.all([1, 2].map(async slot => {
    try {
      const raw = await AsyncStorage.getItem(labelKey(userId, slot));
      const value = raw ? JSON.parse(raw) : null;
      if (typeof value?.phone === 'string' && typeof value?.name === 'string') labels[slot] = value;
    } catch { /* No permission request or contacts upload to recover a label. */ }
  }));
  return labels;
}
export function nomineeName(labels: NomineeLabels, slot: number, phone: string) {
  return labels[slot]?.phone === phone ? labels[slot].name : '';
}
export function fetchNominationProgress() {
  return launchRpc<{ nominations: NominationProgress[] }>('get_my_nomination_progress');
}
