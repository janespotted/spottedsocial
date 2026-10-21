import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type ConversationKind = 'dm' | 'plan';
export async function conversationMuted(kind: ConversationKind, id: string, muted?: boolean): Promise<boolean> {
  if (isDemoMode()) return false;
  const { data, error } = await (supabase.rpc as Rpc)('conversation_notification_preference', {
    p_kind: kind, p_conversation: id, p_muted: muted ?? null,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

let current: { owner: string; kind: ConversationKind; id: string; token: symbol } | null = null;
/** Advisory foreground suppression only; authorization always stays on the server. */
export function focusConversation(owner: string, kind: ConversationKind, id: string): () => void {
  const token = Symbol();
  current = { owner, kind, id, token };
  return () => { if (current?.token === token) current = null; };
}
export function isVisibleConversation(owner: string, data: Record<string, unknown>): boolean {
  if (!current || current.owner !== owner) return false;
  const details = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : {};
  return current.kind === 'dm'
    ? data.type === 'dm' && details.thread_id === current.id
    : data.type === 'plan_comment' && details.plan_id === current.id;
}
