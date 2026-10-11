import AsyncStorage from '@react-native-async-storage/async-storage';

export const INTRO_STEPS = [
  { label: 'CHECK IN', title: 'Set your night.', subtitle: 'Choose your spot and who can see you.' },
  { label: 'THE MAP', title: 'Find your people.', subtitle: 'See where your friends are sharing tonight.' },
  { label: 'YOUR CIRCLE', title: 'Make it a night.', subtitle: 'Your friends. Your plans. Your night.' },
  { label: 'LEADERBOARD', title: 'Find your next spot.', subtitle: 'See the top spots in your city right now' },
] as const;

const key = (userId: string) => `spotted.launchIntro.v2.${userId}`;
const progress = new Map<string, number>();

/** This remembers an explanation, never admission or required setup. */
export async function readIntroStep(userId: string): Promise<number> {
  if (progress.has(userId)) return progress.get(userId)!;
  try {
    const current = await AsyncStorage.getItem(key(userId));
    // V1 had three pages: its completed value must not reopen the tour.
    const legacy = current === null ? await AsyncStorage.getItem(`spotted.launchIntro.v1.${userId}`) : null;
    const value = current === null
      ? legacy === '3' ? INTRO_STEPS.length : ['0', '1', '2'].includes(legacy ?? '') ? Number(legacy) : 0
      : Number(current);
    return progress.get(userId) ?? (Number.isInteger(value) && value >= 0 && value <= INTRO_STEPS.length ? value : 0);
  } catch { return progress.get(userId) ?? 0; }
}

export async function saveIntroStep(userId: string, step: number): Promise<void> {
  const value = Math.max(0, Math.min(INTRO_STEPS.length, Math.trunc(step)));
  progress.set(userId, value);
  await AsyncStorage.setItem(key(userId), String(value)).catch(() => {});
}
