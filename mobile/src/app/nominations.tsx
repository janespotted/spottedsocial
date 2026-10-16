import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { fetchNominationProgress, NOMINATION_LABELS, nomineeName, readNomineeLabels, type NomineeLabels } from '@/lib/nomination-progress';
import { formatE164 } from '@/lib/country-codes';
import { NEON } from '@/lib/theme';
import { EmptyState, ErrorState } from '@/components/empty-state';

export default function NominationsScreen() {
  const { session } = useSession();
  const [labels, setLabels] = useState<NomineeLabels>({});
  const progress = useQuery({ queryKey: ['my-nominations', session?.user.id], enabled: !!session, queryFn: fetchNominationProgress, staleTime: 0 });
  useFocusEffect(useCallback(() => { void progress.refetch(); }, [progress.refetch]));
  useEffect(() => {
    let live = true; setLabels({});
    if (session) void readNomineeLabels(session.user.id).then(value => { if (live) setLabels(value); });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void progress.refetch(); });
    return () => { live = false; subscription.remove(); };
  }, [session?.user.id, progress.refetch]);
  const { refreshing, onRefresh } = usePullToRefresh(progress.refetch);
  const rows = progress.data?.nominations ?? [];
  return <View className="flex-1 pt-safe">
    <View className="flex-row items-center gap-2 px-3 pb-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="min-h-11 min-w-11 items-center justify-center"><SymbolView name="chevron.left" size={20} tintColor="#ffffff" /></Pressable>
      <Text accessibilityRole="header" className="flex-1 text-white text-lg font-sans-semibold">Your nominations</Text>
    </View>
    <ScrollView contentContainerClassName="px-5 pt-5 pb-safe-offset-10 gap-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColorClassName="accent-[#d4ff00]" />}>
      {progress.isLoading ? <ActivityIndicator color={NEON} className="py-12" /> : progress.isError && !progress.data ? <ErrorState title="Couldn’t load nominations" onRetry={onRefresh} retrying={refreshing} /> : rows.length === 0 ? <EmptyState icon="ticket" title="No nominations yet" /> : <>
        <Text className="text-white/60 text-sm font-sans mb-2">Two people. A future wave.</Text>
        {rows.map(row => {
          const name = nomineeName(labels, row.slot, row.phone);
          return <View key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 gap-3">
            <View className="flex-row items-center gap-3">
              <Text className="text-white/55 font-sans-light text-lg">0{row.slot}</Text>
              <View className="flex-1 gap-1"><Text className="text-white text-base font-sans-medium">{name || formatE164(row.phone)}</Text>{name ? <Text className="text-white/60 text-xs font-sans">{formatE164(row.phone)}</Text> : null}</View>
              <SymbolView name={row.status === 'joined' ? 'checkmark.circle' : 'ticket'} size={20} tintColor={row.status === 'joined' ? NEON : 'rgba(255,255,255,0.65)'} />
            </View>
            <Text accessibilityLiveRegion="polite" className="text-white/75 text-sm font-sans">{NOMINATION_LABELS[row.status] ?? 'Waiting for a wave'}</Text>
            {row.status === 'ready' ? <Text className="text-white/60 text-xs font-sans">Their place is open. The invitation hasn’t been sent yet.</Text> : null}
          </View>;
        })}
      </>}
      {progress.isError && progress.data ? <ErrorState compact title="Couldn’t refresh nominations" body="Showing the last update." onRetry={onRefresh} retrying={refreshing} /> : null}
    </ScrollView>
  </View>;
}
