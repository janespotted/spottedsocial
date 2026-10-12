import { supabase } from '@/lib/supabase';
export interface LaunchState {
  admitted: boolean; profileSaved: boolean; complete: boolean; hasPhone: boolean;
  cityTester: boolean; waveAdmin: boolean;
  phoneRequired?: boolean;
  profile: { name: string | null; username: string | null } | null;
  nominations: { slot: number; phone: string; activated: boolean }[];
}
export interface LaunchDashboard {
  gated: boolean; members: number; pending: number; activated: number;
  waves: { id: string; activated_at: string; invitation_count: number }[];
}
type LaunchRpc = 'get_launch_state' | 'save_launch_profile' | 'save_launch_nomination' |
  'complete_launch_onboarding' | 'get_launch_dashboard' | 'activate_launch_wave';
// Generated schema predates this migration. Isolate the new contract here.
export async function launchRpc<T = LaunchState>(name: LaunchRpc, args?: Record<string, unknown>): Promise<T> {
  const client = supabase as unknown as { rpc: (name: LaunchRpc, args?: Record<string, unknown>) => Promise<{ data: T & { error?: string }; error: { message: string; code?: string } | null }> };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.code === '23505' ? 'That username is taken. Try another.' : error.message);
  if (!data || data.error) throw new Error(data?.error || 'Could not save. Please try again.');
  return data;
}
export function launchStage(state: LaunchState): 'phone' | 'waiting' | 'profile' | 'nominate' | 'complete' {
  if (state.complete) return 'complete';
  if (state.phoneRequired && !state.hasPhone) return 'phone';
  if (!state.admitted) return 'waiting';
  if (!state.profileSaved) return 'profile';
  return state.complete ? 'complete' : 'nominate';
}
export function nominationPhone(raw: string): string | null {
  if (/[^\d\s()+.-]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  const phone = raw.trim().startsWith('+') ? `+${digits}` : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : '';
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
