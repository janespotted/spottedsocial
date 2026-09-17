import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { openFriendCard } from '@/lib/friend-card';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

interface Liker {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

/** Who liked a post — port of the web PostLikesModal. */
export default function PostLikesScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { session } = useSession();

  const { data: likers, isLoading } = useQuery({
    queryKey: ['post-likes', postId],
    enabled: !!postId && !!session,
    queryFn: async (): Promise<Liker[]> => {
      const [{ data: rows }, profiles] = await Promise.all([
        supabase
          .from('post_likes')
          .select('user_id, created_at')
          .eq('post_id', postId!)
          .order('created_at', { ascending: false }),
        fetchProfilesSafe(),
      ]);
      const profileMap = buildProfileMap(profiles);
      return (rows ?? []).map((l) => ({
        user_id: l.user_id,
        display_name: profileMap.get(l.user_id)?.display_name ?? 'Friend',
        username: profileMap.get(l.user_id)?.username ?? '',
        avatar_url: profileMap.get(l.user_id)?.avatar_url ?? null,
      }));
    },
  });

  return (
    <View className="flex-1 bg-[#110a24]">
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
        <Text className="text-white text-base font-sans-semibold">Likes</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={NEON} />
        </View>
      ) : (
        <LegendList
          recycleItems
          data={likers ?? []}
          keyExtractor={(l) => l.user_id}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          ListEmptyComponent={
            <Text className="text-white/55 text-sm font-sans text-center py-12">
              No likes yet.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openFriendCard(item.user_id, session?.user.id)}
              className="flex-row items-center gap-3 active:opacity-70"
            >
              <Avatar name={item.display_name} url={item.avatar_url} size="sm" />
              <View className="flex-1 min-w-0">
                <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
                  {item.display_name}
                </Text>
                {item.username ? (
                  <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
                    @{item.username}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
