import { supabase } from './supabase';

/** Links must work for everyone — always the published web app URL. */
export const APP_BASE_URL = 'https://spottedsocial.vercel.app';

export interface InviteCode {
  code: string;
  uses_count: number;
}

export const getInviteUrl = (code: string) => `${APP_BASE_URL}/invite/${code}`;

// No ambiguous chars (0/O, 1/I) — web parity
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

export async function fetchOrCreateInviteCode(userId: string): Promise<InviteCode | null> {
  const { data: existing } = await supabase
    .from('invite_codes')
    .select('code, uses_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { code: existing.code, uses_count: existing.uses_count ?? 0 };
  return regenerateInviteCode(userId);
}

export async function regenerateInviteCode(userId: string): Promise<InviteCode | null> {
  const { data, error } = await supabase
    .from('invite_codes')
    .insert({ user_id: userId, code: randomCode() })
    .select('code, uses_count')
    .single();
  if (error || !data) return null;
  return { code: data.code, uses_count: data.uses_count ?? 0 };
}
