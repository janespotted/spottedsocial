import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { launchRpc, type LaunchDashboard } from '@/lib/launch';
export interface PendingWave { id: string; count: number }
const key = (userId: string) => `spotted.pendingWave.${userId}`;
export async function getPendingWave(userId: string): Promise<PendingWave | null> {
  const saved = await AsyncStorage.getItem(key(userId));
  if (!saved) return null;
  const request: PendingWave = JSON.parse(saved);
  if (!/^[a-f0-9-]{36}$/.test(request.id) || !Number.isInteger(request.count) || request.count < 1 || request.count > 500) throw new Error('Could not recover the pending wave. Review recent waves before retrying.');
  return request;
}
/** Persist before any write: a lost response or app restart retries the same wave. */
export async function activateWave(userId: string, count: number): Promise<LaunchDashboard> {
  const request = await getPendingWave(userId) || { id: randomUUID(), count };
  await AsyncStorage.setItem(key(userId), JSON.stringify(request));
  const result = await launchRpc<LaunchDashboard>('activate_launch_wave', { p_request: request.id, p_count: request.count });
  await AsyncStorage.removeItem(key(userId));
  return result;
}
