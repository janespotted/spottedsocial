import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { IconButton } from '@/components/icon-button';
import { SpottedMark } from '@/components/spotted-mark';
import { useNightMode } from '@/hooks/use-night-mode';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { control, controlTint, NEON } from '@/lib/theme';

/** Short word for the user's own answer tonight, or the call to give one. */
function statusWord(status: string | null | undefined): { label: string; answered: boolean } {
  switch (status) {
    case 'out':
      return { label: 'Out', answered: true };
    case 'off':
      return { label: 'Hidden', answered: true };
    case 'planning':
      return { label: 'TBD', answered: true };
    case 'home':
      return { label: 'In', answered: true };
    default:
      // No answer yet tonight (e.g. daytime, after the 5 AM reset).
      // Wording to be confirmed with the client ("Status" vs "Set status").
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
  const { isNight } = useNightMode();
  const { label, answered } = statusWord(data?.status?.status);
  // Before Night Mode opens there is no status to set (DAY-NIGHT-MODE-PLAN.md
  // D7): the pill says "Day" and opens the hours instead of the status flow.
  if (!isNight) return <DayPill />;
  return (
    <Pressable
      onPress={() => router.push('/check-in')}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={answered ? `Update status. Tonight: ${label}` : 'Set your status for tonight'}
      className="h-9 pl-2.5 pr-3 rounded-full flex-row items-center gap-1.5 border active:opacity-80"
      style={{
        backgroundColor: answered ? 'rgba(212,255,0,0.12)' : 'rgba(255,255,255,0.10)',
        borderColor: answered ? 'rgba(212,255,0,0.45)' : 'rgba(255,255,255,0.12)',
      }}
    >
      <SpottedMark size={18} />
      <Text
        className="text-xs font-sans-semibold"
        style={{ color: answered ? NEON : 'rgba(255,255,255,0.85)' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Day Mode's header pill: "☀ Day", opening the Night Mode hours. */
function DayPill() {
  return (
    <Pressable
      onPress={() => router.push('/night-hours')}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Day Mode. See when Night Mode opens"
      className={`h-9 pl-2.5 pr-3 rounded-full flex-row items-center gap-1.5 active:opacity-80 ${control.ordinary}`}
    >
      <SymbolView name="sun.max" size={15} tintColor={controlTint.ordinary} />
      <Text className="text-xs font-sans-semibold" style={{ color: controlTint.ordinary }}>
        Day
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
