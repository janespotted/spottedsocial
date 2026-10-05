import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { Invite, InviteKind, InviteStatus } from '@/lib/dm-invites';
import {
  INK_LIGHT,
  NEON,
  outlineControl,
  primaryControl,
  primaryControlText,
} from '@/lib/theme';

function cardTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const STATUS: Record<InviteStatus, { label: string; icon: SFSymbol; pill: string; text: string; tint: string }> = {
  pending: { label: 'Pending', icon: 'clock', pill: 'bg-white/10', text: 'text-white/70', tint: 'rgba(255,255,255,0.7)' },
  accepted: { label: 'Accepted', icon: 'checkmark', pill: 'bg-[#d4ff00]/15', text: 'text-[#d4ff00]', tint: NEON },
  declined: { label: 'Declined', icon: 'xmark', pill: 'bg-[#ff3b5c]/15', text: 'text-white/70', tint: 'rgba(255,255,255,0.7)' },
};

/** Pending / Accepted / Declined, as on the cards; Activity uses it too. */
export function InviteStatusPill({ status }: { status: InviteStatus }) {
  const s = STATUS[status];
  return (
    <View className={`self-start flex-row items-center gap-1.5 h-7 px-2.5 rounded-full ${s.pill}`}>
      <SymbolView name={s.icon} size={11} tintColor={s.tint} weight="semibold" />
      <Text className={`text-xs font-sans-medium ${s.text}`}>{s.label}</Text>
    </View>
  );
}

/** Wording per kind and side; `name` is the other person's first name. */
function copyFor(kind: InviteKind, isMine: boolean, name: string) {
  if (kind === 'venue') {
    return isMine
      ? { header: 'You sent an invite request', title: `Invitation sent to ${name}`, at: 'at' }
      : { header: `${name} sent you an invite request`, title: `${name} invited you`, at: 'to' };
  }
  return isMine
    ? { header: 'You sent a meet up request', title: `Meet up request sent to ${name}`, at: 'at' }
    : { header: `${name} sent you a meet up request`, title: `${name} wants to meet up`, at: 'at' };
}

/**
 * A venue invite or Meet Up request in the DM thread (client mockups, Oct
 * 2026). Sent cards carry a Pending / Accepted / Declined pill; received
 * cards carry Accept / Decline until answered — here or in Activity — then
 * the same pill. The status comes from the `invites` row, live. `invite` is
 * undefined while loading and null when the row can't be read (withdrawn,
 * cancelled, expired, blocked).
 */
export function InviteCard({
  kind,
  invite,
  isMine,
  otherFirstName,
  createdAt,
  busy,
  onRespond,
  onOpenVenue,
}: {
  kind: InviteKind;
  invite: Invite | null | undefined;
  isMine: boolean;
  /** The other person: the receiver on a sent card, the sender on a received one. */
  otherFirstName: string;
  createdAt: string;
  busy: boolean;
  onRespond: (accept: boolean) => void;
  onOpenVenue: (venueId: string) => void;
}) {
  if (invite === null) {
    return (
      <View className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <Text className="text-white/50 text-sm font-sans italic">
          {kind === 'venue' ? 'Invite no longer available' : 'Meet up no longer available'}
        </Text>
      </View>
    );
  }

  const copy = copyFor(kind, isMine, otherFirstName);
  const label = invite
    ? `${copy.title}${invite.venue_name ? ` ${copy.at} ${invite.venue_name}` : ''}${
        isMine || invite.status !== 'pending' ? `, ${STATUS[invite.status].label}` : ''
      }`
    : copy.title;
  return (
    <View
      className="w-72.5 max-w-full rounded-2xl border border-white/15 bg-white/[0.07] p-4 gap-2.5"
      accessibilityLabel={label}
    >
      <View className="flex-row items-center gap-1.5">
        <SymbolView name={isMine ? 'paperplane' : 'bubble.left'} size={13} tintColor={NEON} />
        <Text className="text-white/60 text-[11px] font-sans flex-1" numberOfLines={1}>
          {copy.header}
        </Text>
      </View>

      <Text className="text-white text-[17px] font-sans-semibold leading-6" numberOfLines={2}>
        {copy.title}
      </Text>

      {!invite ? (
        <View className="h-5 w-32 rounded bg-white/10" />
      ) : invite.venue_name ? (
        <Pressable
          onPress={() => invite.venue_id && onOpenVenue(invite.venue_id)}
          disabled={!invite.venue_id}
          hitSlop={4}
          className="flex-row items-center gap-1.5 self-start active:opacity-70"
          accessibilityRole={invite.venue_id ? 'link' : undefined}
        >
          <SymbolView name="mappin.and.ellipse" size={13} tintColor={NEON} />
          <Text className="text-white text-sm font-sans" numberOfLines={1}>
            {copy.at} {invite.venue_name}
          </Text>
        </Pressable>
      ) : null}

      {!invite ? null : !isMine && invite.status === 'pending' ? (
        <View className="flex-row gap-2.5 mt-1">
          <Pressable
            onPress={() => onRespond(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={kind === 'venue' ? `Accept ${otherFirstName}'s invite` : `Accept meet up with ${otherFirstName}`}
            className={`flex-1 min-h-11 rounded-full flex-row items-center justify-center gap-1.5 active:opacity-85 disabled:opacity-60 ${primaryControl}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color={INK_LIGHT} />
            ) : (
              <>
                <SymbolView name="checkmark" size={13} tintColor={INK_LIGHT} weight="semibold" />
                <Text className={`text-sm font-sans-semibold ${primaryControlText}`}>Accept</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={() => onRespond(false)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={kind === 'venue' ? `Decline ${otherFirstName}'s invite` : `Decline meet up with ${otherFirstName}`}
            className={`flex-1 min-h-11 rounded-full flex-row items-center justify-center gap-1.5 disabled:opacity-60 ${outlineControl}`}
          >
            <SymbolView name="xmark" size={12} tintColor="#ffffff" weight="semibold" />
            <Text className="text-white text-sm font-sans-medium">Decline</Text>
          </Pressable>
        </View>
      ) : (
        <InviteStatusPill status={invite.status} />
      )}

      <Text className="text-white/45 text-[11px] font-sans text-right">{cardTime(createdAt)}</Text>
    </View>
  );
}
