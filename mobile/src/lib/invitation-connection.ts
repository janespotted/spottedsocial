import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';
import { normalizeInvitationCode } from './invitation-links';
export interface InvitationConnection {
  user_id: string; display_name: string; username: string; avatar_url: string | null;
  state: 'available' | 'requested' | 'incoming' | 'friends'; request_created: boolean;
}
export async function connectInvitation(code: string, request = false): Promise<InvitationConnection> {
  if (isDemoMode() || !normalizeInvitationCode(code)) throw new Error('Enter a valid invitation code outside Demo.');
  const { data, error } = await (supabase.rpc as unknown as (name: string, args: object) => PromiseLike<{ data: InvitationConnection; error: { message: string } | null }>)
    ('connect_invitation', { p_code: normalizeInvitationCode(code), p_request: request });
  if (error) throw new Error(error.message);
  return data;
}
