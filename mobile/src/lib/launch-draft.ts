import AsyncStorage from '@react-native-async-storage/async-storage';
export interface LaunchDraft { name: string; username: string; terms: boolean }
const key = (userId: string) => `spotted.launchDraft.v1.${userId}`;
const operations = new Map<string, Promise<unknown>>();
function ordered<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const next = (operations.get(userId) || Promise.resolve()).then(action, action);
  operations.set(userId, next.catch(() => undefined));
  return next;
}
export async function readLaunchDraft(userId: string): Promise<LaunchDraft | null> {
  return ordered(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(key(userId));
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (typeof value.name !== 'string' || typeof value.username !== 'string' || typeof value.terms !== 'boolean') return null;
      return { name: value.name.slice(0, 50), username: value.username.slice(0, 20), terms: value.terms };
    } catch { return null; }
  });
}
export const saveLaunchDraft = (userId: string, draft: LaunchDraft) => ordered(userId, () => AsyncStorage.setItem(key(userId), JSON.stringify(draft))).catch(() => undefined);
export const clearLaunchDraft = (userId: string) => ordered(userId, () => AsyncStorage.removeItem(key(userId))).catch(() => undefined);
