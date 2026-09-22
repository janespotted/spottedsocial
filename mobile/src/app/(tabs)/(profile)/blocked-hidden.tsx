import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';

interface PersonRow {
  rowId: string;
  userId: string;
  display_name: string;
  avatar_url: string | null;
}

/** Blocked & Hidden — port of the web BlockedHidden page. */
export default function BlockedHiddenScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  // pb-32 clears the native tab bar + home indicator (see settings.tsx)
  const contentContainerStyle = useResolveClassNames('px-4 pt-5 pb-32 gap-5');

  const { data, refetch } = useQuery({
    queryKey: ['blocked-hidden', userId],
    enabled: !!session,
    queryFn: async () => {
      const [profiles, hiddenRes, blockedRes] = await Promise.all([
        fetchProfilesSafe(),
        // location_hidden is missing from the generated types
        supabase
          .from('location_hidden' as never)
          .select('id, hidden_from_id')
          .eq('user_id', userId!),
        supabase.from('blocked_users').select('id, blocked_id').eq('blocker_id', userId!),
      ]);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const toRow = (rowId: string, targetId: string): PersonRow => ({
        rowId,
        userId: targetId,
        display_name: profileMap.get(targetId)?.display_name ?? 'Unknown',
        avatar_url: profileMap.get(targetId)?.avatar_url ?? null,
      });
      const hiddenRows = (hiddenRes.data ?? []) as Array<{ id: string; hidden_from_id: string }>;
      return {
        hidden: hiddenRows.map((r) => toRow(r.id, r.hidden_from_id)),
        blocked: (blockedRes.data ?? []).map((r) => toRow(r.id, r.blocked_id)),
      };
    },
  });

  const unhide = async (row: PersonRow) => {
    await supabase.from('location_hidden' as never).delete().eq('id', row.rowId);
    refetch();
  };
  const unblock = async (row: PersonRow) => {
    await supabase.from('blocked_users').delete().eq('id', row.rowId);
    refetch();
  };

  const renderSection = (
    title: string,
    subtitle: string,
    rows: PersonRow[],
    actionLabel: string,
    onAction: (row: PersonRow) => void
  ) => (
    <View className="gap-2">
      <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
        {title}
      </Text>
      <Text className="text-white/45 text-xs font-sans -mt-1">{subtitle}</Text>
      {rows.length === 0 ? (
        <Text className="text-white/55 text-sm font-sans py-2">No one here</Text>
      ) : (
        rows.map((row) => (
          <View key={row.rowId} className="flex-row items-center gap-3 py-2">
            <Avatar name={row.display_name} url={row.avatar_url} size="sm" />
            <Text className="text-white text-sm font-sans-medium flex-1" numberOfLines={1}>
              {row.display_name}
            </Text>
            <Pressable
              onPress={() => onAction(row)}
              className="px-3.5 py-1.5 rounded-full border border-white/20 active:bg-white/5"
            >
              <Text className="text-white text-xs font-sans-medium">{actionLabel}</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View className="flex-1">
      <View
        className="pt-safe-offset-3 pb-3 px-4 flex-row items-center gap-3 border-b border-white/10"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} className="active:opacity-60">
          <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <Text className="text-white font-sans-semibold text-base flex-1">Blocked & Hidden</Text>
      </View>

      <ScrollView contentContainerStyle={contentContainerStyle}>
        {renderSection(
          'Hidden From',
          "They stay your friend — they just can't see you on the map",
          data?.hidden ?? [],
          'Unhide',
          unhide
        )}
        {renderSection(
          'Blocked',
          "They can't see you, message you, or send requests",
          data?.blocked ?? [],
          'Unblock',
          unblock
        )}
      </ScrollView>
    </View>
  );
}
