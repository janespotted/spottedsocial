import AsyncStorage from '@react-native-async-storage/async-storage';

export const FIRST_USE_TIPS = {
  status: 'Pick your status, then confirm. You can change it anytime.',
  map: 'Tap a pin to connect. Your status controls who sees your location.',
  recap: 'Your stops, photos and familiar faces. This recap is just for you.',
} as const;

export type FirstUseTipId = keyof typeof FIRST_USE_TIPS;
const dismissed = new Set<string>();
const key = (userId: string, tip: FirstUseTipId) => `spotted.firstUse.v1.${userId}.${tip}`;

/** Tips are local guidance, never an admission or permission flag. */
export async function shouldShowTip(userId: string, tip: FirstUseTipId): Promise<boolean> {
  const id = key(userId, tip);
  if (dismissed.has(id)) return false;
  try {
    const saved = await AsyncStorage.getItem(id);
    return saved !== '1' && !dismissed.has(id);
  } catch {
    // An unavailable preference must never interrupt using the app.
    return false;
  }
}

export async function dismissTip(userId: string, tip: FirstUseTipId): Promise<void> {
  const id = key(userId, tip);
  dismissed.add(id);
  await AsyncStorage.setItem(id, '1').catch(() => {});
}
