import AsyncStorage from '@react-native-async-storage/async-storage';

export const INTRO_STEPS = [
  { label: 'CHECK IN', title: 'Set your night.', subtitle: 'Choose your spot and who can see you.' },
  { label: 'THE MAP', title: 'Find your people.', subtitle: 'See where your friends are sharing tonight.' },
  { label: 'LEADERBOARD', title: 'Find your next spot.', subtitle: 'Explore spots with activity shared with you.' },
] as const;

const key = (userId: string) => `spotted.launchIntro.v1.${userId}`;
const progress = new Map<string, number>();

/** This remembers an explanation, never admission or required setup. */
export async function readIntroStep(userId: string): Promise<number> {
  if (progress.has(userId)) return progress.get(userId)!;
  try {
    const value = Number(await AsyncStorage.getItem(key(userId)));
    return progress.get(userId) ?? (Number.isInteger(value) && value >= 0 && value <= INTRO_STEPS.length ? value : 0);
  } catch { return progress.get(userId) ?? 0; }
}

export async function saveIntroStep(userId: string, step: number): Promise<void> {
  const value = Math.max(0, Math.min(INTRO_STEPS.length, Math.trunc(step)));
  progress.set(userId, value);
  await AsyncStorage.setItem(key(userId), String(value)).catch(() => {});
}
