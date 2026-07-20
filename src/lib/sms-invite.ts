import { APP_BASE_URL } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { isNativePlatform } from '@/lib/platform';

/**
 * Generate or fetch an invite code for the current user
 */
export async function getOrCreateInviteCode(userId: string): Promise<string> {
  // Try existing code first
  const { data: existing } = await supabase
    .from('invite_codes')
    .select('code')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.code) return existing.code;

  // Generate new code and confirm it's persisted before returning
  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 8; i++) {
      c += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return c;
  };

  const code = generateCode();
  const { data, error } = await supabase
    .from('invite_codes')
    .insert({ user_id: userId, code })
    .select('code')
    .single();

  if (!error && data?.code) return data.code;

  // Retry once with a fresh code
  const retryCode = generateCode();
  const { data: retryData, error: retryError } = await supabase
    .from('invite_codes')
    .insert({ user_id: userId, code: retryCode })
    .select('code')
    .single();

  if (!retryError && retryData?.code) return retryData.code;

  throw new Error('Failed to create invite code');
}

/**
 * Build the invite deep link URL
 */
export function getInviteLink(inviteCode: string, venueId?: string): string {
  const base = `${APP_BASE_URL}/invite/${inviteCode}`;
  return venueId ? `${base}?venue=${venueId}` : base;
}

/**
 * Build a personal, contextual SMS invite message
 */
export function buildSmsInviteMessage(opts: {
  senderName: string;
  venueName?: string;
  inviteLink: string;
}): string {
  const { senderName, venueName, inviteLink } = opts;

  if (venueName) {
    return `${senderName} wants to meet up with you at ${venueName} tonight! 🎉\n\nDownload Spotted to see where everyone is:\n${inviteLink}`;
  }
  return `${senderName} invited you to Spotted — see where your friends are going out tonight! 🎉\n\n${inviteLink}`;
}

/**
 * Trigger native SMS/share sheet with the invite message.
 * On native (Capacitor), uses the Share plugin.
 * On web, uses navigator.share or falls back to sms: URI.
 */
export async function triggerSmsInvite(opts: {
  senderName: string;
  venueName?: string;
  inviteLink: string;
  contactName?: string;
}): Promise<void> {
  const message = buildSmsInviteMessage(opts);

  if (isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: 'Join me on Spotted!',
        text: message,
        dialogTitle: `Invite${opts.contactName ? ` ${opts.contactName}` : ''} to Spotted`,
      });
      return;
    } catch {
      // Fall through to web fallback
    }
  }

  // Web: try navigator.share, fallback to sms: URI
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Join me on Spotted!',
        text: message,
      });
      return;
    } catch {
      // User cancelled or not supported
    }
  }

  // Last resort: open SMS compose
  const smsBody = encodeURIComponent(message);
  window.open(`sms:?body=${smsBody}`, '_self');
}
