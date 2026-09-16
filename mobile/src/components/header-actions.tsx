import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from '@/components/styled';
import { IconButton } from '@/components/icon-button';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { NEON } from '@/lib/theme';
import spottedLogo from '../../assets/images/spotted-s-logo.png';

/** Short word for the user's own answer tonight, or the call to give one. */
function statusWord(status: string | null | undefined): { label: string; answered: boolean } {
  switch (status) {
    case 'out':
    case 'off':
      return { label: 'Out', answered: true };
    case 'planning':
      return { label: 'TBD', answered: true };
    case 'home':
      return { label: 'In', answered: true };
    default:
      return { label: 'Status', answered: false };
  }
}

/**
 * The S mark used to be a bare logo that secretly opened the status flow
 * (client feedback §6). It is now a labelled pill: the mark plus the
 * user's current answer — Out / TBD / In — or "Status" when there is none
 * yet, so it reads as the way to update tonight's status.
 */
export function StatusPill() {
  const { data } = useOwnNightStatus();
  const { label, answered } = statusWord(data?.status?.status);
  return (
    <Pressable
      onPress={() => router.push('/check-in')}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Update status. Tonight: ${label}`}
      className="h-9 pl-0.5 pr-3 rounded-full flex-row items-center gap-1 border active:opacity-80"
      style={{
        backgroundColor: answered ? 'rgba(212,255,0,0.12)' : 'rgba(255,255,255,0.10)',
        borderColor: answered ? 'rgba(212,255,0,0.45)' : 'rgba(255,255,255,0.12)',
      }}
    >
      <Image source={spottedLogo} className="h-8 w-8" contentFit="contain" />
      <Text
        className="text-xs font-sans-semibold"
        style={{ color: answered ? NEON : 'rgba(255,255,255,0.85)' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Right-hand cluster of every tab header: search, notifications, status.
 * The bell is an ordinary control (no permanent fill); unread shows as a
 * neon count. The same cluster on all tabs is the point — extracted once
 * it was duplicated five times.
 */
export function HeaderActions({ unreadCount }: { unreadCount: number }) {
  return (
    <View className="flex-row items-center gap-2">
      <IconButton icon="magnifyingglass" label="Search" onPress={() => router.push('/search')} />
      <IconButton icon="bell" label="Notifications" badge={unreadCount} onPress={() => router.push('/activity')} />
      <StatusPill />
    </View>
  );
}
