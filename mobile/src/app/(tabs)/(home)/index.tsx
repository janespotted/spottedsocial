import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Chip, Skeleton } from 'heroui-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/hooks/use-session';
import { useFriendsOut, type FriendNightStatus } from '@/hooks/use-friends-out';
import { invalidateOutStatusCache } from '@/lib/night-status';
import { startBackgroundLocation, stopBackgroundLocation } from '@/lib/background-location';

/** Next 5am local time — the app's night boundary. */
function next5am(): string {
  const d = new Date();
  if (d.getHours() >= 5) d.setDate(d.getDate() + 1);
  d.setHours(5, 0, 0, 0);
  return d.toISOString();
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-muted-dark text-xs font-bold uppercase tracking-widest px-1">
      {children}
    </Text>
  );
}

function StatusCard() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const { data: myStatus } = useQuery({
    queryKey: ['my-night-status', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from('night_statuses')
        .select('status, expires_at')
        .eq('user_id', session!.user.id)
        .maybeSingle();
      const active =
        data && data.expires_at && new Date(data.expires_at) > new Date() ? data.status : null;
      return active as 'out' | 'planning' | null;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: 'out' | 'planning') => {
      // party_address intentionally excluded from upserts (see web night-status.ts)
      const { error } = await supabase.from('night_statuses').upsert(
        {
          user_id: session!.user.id,
          status,
          expires_at: next5am(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidateOutStatusCache();
      if (status === 'out') {
        startBackgroundLocation(session!.user.id);
      } else {
        stopBackgroundLocation();
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-night-status'] });
      queryClient.invalidateQueries({ queryKey: ['friends-out'] });
    },
  });

  return (
    <View className="bg-gradient-to-br from-surface-secondary to-surface rounded-3xl border border-white/5 p-5 gap-4">
      <View className="gap-1">
        <Text className="text-foreground text-xl font-bold">
          {myStatus === 'out'
            ? 'You’re out tonight 🎉'
            : myStatus === 'planning'
              ? 'You’re thinking about it…'
              : 'What’s the move tonight?'}
        </Text>
        <Text className="text-muted text-sm">
          {myStatus
            ? 'Friends who can see you know your status.'
            : 'Let your friends know if you’re heading out.'}
        </Text>
      </View>
      <View className="flex-row gap-2.5">
        <Button
          variant={myStatus === 'out' ? 'secondary' : 'primary'}
          size="sm"
          className="flex-1"
          isDisabled={setStatus.isPending}
          onPress={() => setStatus.mutate('out')}
        >
          <Button.Label>I’m out</Button.Label>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          isDisabled={setStatus.isPending}
          onPress={() => setStatus.mutate('planning')}
        >
          <Button.Label>Still deciding</Button.Label>
        </Button>
      </View>
      {setStatus.isError ? (
        <Text className="text-danger text-sm">{(setStatus.error as Error).message}</Text>
      ) : null}
    </View>
  );
}

function FriendRow({ friend }: { friend: FriendNightStatus }) {
  const subtitle =
    friend.status === 'out'
      ? friend.venue_name ?? 'Out somewhere'
      : friend.planning_venue_name
        ? `Considering ${friend.planning_venue_name}`
        : friend.planning_neighborhood
          ? `Planning · ${friend.planning_neighborhood}`
          : 'Figuring out the night';

  return (
    <View className="flex-row items-center gap-3">
      <Avatar name={friend.display_name} url={friend.avatar_url} />
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-base font-semibold">{friend.display_name}</Text>
        <Text className="text-muted text-sm">{subtitle}</Text>
      </View>
      <Chip variant="secondary" size="sm" color={friend.status === 'out' ? 'success' : 'warning'}>
        <Chip.Label>{friend.status === 'out' ? 'OUT' : 'TBD'}</Chip.Label>
      </Chip>
    </View>
  );
}

function FriendsSection({
  label,
  emptyText,
  friends,
  isLoading,
}: {
  label: string;
  emptyText: string;
  friends: FriendNightStatus[];
  isLoading: boolean;
}) {
  return (
    <View className="gap-2.5">
      <SectionLabel>{label}</SectionLabel>
      <View className="bg-surface rounded-3xl border border-white/5 p-4 gap-4">
        {isLoading ? (
          <View className="flex-row items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-3.5 w-32 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </View>
          </View>
        ) : friends.length > 0 ? (
          friends.map((f) => <FriendRow key={f.user_id} friend={f} />)
        ) : (
          <Text className="text-muted text-sm">{emptyText}</Text>
        )}
      </View>
    </View>
  );
}

function HotVenuesGrid() {
  const { data: venues, isLoading } = useQuery({
    queryKey: ['hot-venues', 'nyc'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, neighborhood')
        .eq('city', 'nyc')
        .eq('is_demo', false)
        .order('popularity_rank', { ascending: true, nullsFirst: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  return (
    <View className="gap-2.5">
      <SectionLabel>Hot right now</SectionLabel>
      <View className="bg-surface rounded-3xl border border-white/5 p-4 flex-row flex-wrap">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <View key={i} className="w-1/3 items-center gap-2 py-3">
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </View>
            ))
          : venues?.map((v) => (
              <View key={v.id} className="w-1/3 items-center gap-2 py-3 px-1">
                <View className="h-14 w-14 rounded-full bg-surface-secondary items-center justify-center">
                  <Text className="text-accent text-xl font-bold">{v.name[0]}</Text>
                </View>
                <Text className="text-foreground text-xs font-medium text-center" numberOfLines={1}>
                  {v.name}
                </Text>
                <Text className="text-muted-dark text-[10px] text-center" numberOfLines={1}>
                  {v.neighborhood}
                </Text>
              </View>
            ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { data, isLoading, refetch, isRefetching } = useFriendsOut();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4 gap-5"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColorClassName="accent-accent"
        />
      }
    >
      <StatusCard />
      <FriendsSection
        label="Out tonight"
        emptyText="No friends are out yet — the night is young."
        friends={data?.outFriends ?? []}
        isLoading={isLoading}
      />
      <FriendsSection
        label="Still deciding"
        emptyText="Nobody is on the fence right now."
        friends={data?.planningFriends ?? []}
        isLoading={isLoading}
      />
      <HotVenuesGrid />
    </ScrollView>
  );
}
