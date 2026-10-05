import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';

/**
 * Venue invites and Meet Up requests are cards in the 1:1 DM (migration
 * 20261005120000). An `invites` row is the source of truth for the card's
 * status; the thread message is only a pointer to it. The request
 * notification stays in Activity with the answer in `data.status`, so an
 * answer given in the thread or in Activity shows on both.
 */

export interface InviteFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export type InviteKind = 'venue' | 'meetup';
export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface Invite {
  id: string;
  kind: InviteKind;
  sender_id: string;
  receiver_id: string;
  thread_id: string;
  message_id: string;
  /** Venue: where they're invited. Meet up: where the receiver was, if the sender could see it. */
  venue_id: string | null;
  venue_name: string | null;
  status: InviteStatus;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
}

const INVITE_COLUMNS =
  'id, kind, sender_id, receiver_id, thread_id, message_id, venue_id, venue_name, status, created_at, responded_at, expires_at';

/** The answer a request notification records (Activity reads it). */
export function notificationInviteStatus(data: Record<string, unknown> | undefined): InviteStatus | null {
  const status = data?.status;
  return status === 'pending' || status === 'accepted' || status === 'declined' ? status : null;
}

export interface SendInvitesResult {
  ok: boolean;
  /** Invite ids the send created — Undo withdraws exactly these. */
  inviteIds: string[];
  recipientIds: string[];
  /** Recipient → their 1:1 thread, where the invite card now sits. */
  threadIds: Record<string, string>;
}

/**
 * Invite friends to a venue. One RPC does it all server-side, per friend:
 * find-or-create the 1:1 thread, post the invite card into it, save the
 * invite and queue the "invited you" notification + push. Non-friends,
 * blocked and demo people are skipped. Sending the same venue to the same
 * friend twice in a night returns the existing invite rather than a second
 * card.
 */
export async function sendVenueInvites(venueId: string, friends: InviteFriend[]): Promise<SendInvitesResult> {
  const empty: SendInvitesResult = { ok: false, inviteIds: [], recipientIds: [], threadIds: {} };
  if (friends.length === 0) return empty;
  try {
    const { data, error } = await supabase.rpc('send_venue_invites', {
      p_venue_id: venueId,
      p_receivers: friends.map((f) => f.id),
    });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return empty;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return {
      ok: true,
      // Only invites this send created are this send's to undo; a re-send
      // of last hour's invite must not be able to withdraw it.
      inviteIds: rows.filter((r) => r.created).map((r) => r.invite_id),
      recipientIds: rows.map((r) => r.receiver_id),
      threadIds: Object.fromEntries(rows.map((r) => [r.receiver_id, r.thread_id])),
    };
  } catch {
    return empty;
  }
}

/** The invites behind the cards in a thread (RLS: only its two people). */
export async function fetchInvites(ids: string[]): Promise<Invite[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('invites').select(INVITE_COLUMNS).in('id', ids);
  if (error) throw error;
  return (data ?? []) as Invite[];
}

/**
 * Accept or decline (receiver only, once), from the card or from Activity.
 * The server records the answer on the request notification and notifies the
 * sender either way. Answering twice returns the saved answer rather than
 * failing, so the returned row is what to show.
 */
export async function respondToInvite(inviteId: string, accept: boolean): Promise<Invite> {
  const { data, error } = await supabase.rpc('respond_to_invite', {
    p_invite: inviteId,
    p_accept: accept,
  });
  if (error || !data) throw error ?? new Error('Invite unavailable');
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  return data as Invite;
}

/**
 * Undo on the "Invites Sent!" / Meet Up confirmation. Withdraws the sender's
 * still-pending invites, and the card, notification and queued push go with
 * them. True only when every one was withdrawn (an answered invite stays).
 */
export async function withdrawInvites(inviteIds: string[]): Promise<boolean> {
  const ids = [...new Set(inviteIds)];
  if (ids.length === 0) return false;
  const { data, error } = await supabase.rpc('withdraw_invites', { p_ids: ids });
  return !error && data === ids.length;
}
