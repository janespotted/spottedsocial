import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Avatar } from '@/components/avatar';
import { useNightRecap } from '@/hooks/use-night-recap';
import { useSession } from '@/hooks/use-session';
import { createDmThread } from '@/lib/dm';
import { openFriendCard } from '@/lib/friend-card';
import { primaryControl, primaryControlText, recapCover } from '@/lib/theme';

/**
 * A friend from "Look who was there" (screenshot 07). Worded as overlapping
 * check-ins, never as proof the two met (client brief §3). Say hey opens
 * the DM; the avatar opens their friend card.
 */
export default function CrossedPaths() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const { session } = useSession();
  const { data: recap } = useNightRecap();
  const person = recap?.people.find((p) => p.friend_id === friendId);
  const [opening, setOpening] = useState(false);

  const sayHey = async () => {
    if (!person || opening) return;
    setOpening(true);
    try {
      const threadId = await createDmThread(person.friend_id);
      router.push({
        pathname: '/thread',
        params: { threadId, title: person.display_name, avatarUrl: person.avatar_url ?? '' },
      });
    } catch {
      Alert.alert('Couldn’t open the chat', 'Try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <View className="flex-1 bg-[#110a24] px-4 pt-safe-offset-2">
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        accessibilityRole="button"
        className="flex-row items-center gap-2 self-start min-h-11 active:opacity-70"
      >
        <SymbolView name="arrow.left" size={14} tintColor="rgba(255,255,255,0.7)" />
        <Text className="text-white/70 text-sm font-sans">Morning After</Text>
      </Pressable>

      {!person ? (
        <Text className="text-white/60 text-sm font-sans mt-6">This person is no longer in your recap.</Text>
      ) : (
        <>
          <Pressable
            onPress={() => session && openFriendCard(person.friend_id, session.user.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${person.display_name}'s card`}
            className="flex-row items-center gap-4 mt-4 mb-5 self-start active:opacity-80"
          >
            <Avatar name={person.display_name} url={person.avatar_url} size="lg" />
            <View>
              <Text className="text-white text-2xl font-sans-semibold">{person.display_name}</Text>
              <Text className="text-white/60 text-sm font-sans">Friend</Text>
            </View>
          </Pressable>

          <View className={`rounded-2xl px-4 py-5 ${recapCover}`}>
            <Text className="text-white/75 text-xs font-sans-medium tracking-[1px]">YOU CROSSED PATHS</Text>
            <Text className="text-white text-2xl font-sans-semibold mt-2">{person.venue_name}</Text>
            <Text className="text-white/70 text-sm font-sans mt-2">Last night · You were there at overlapping times.</Text>
          </View>
          <Text className="text-white/60 text-sm font-sans mt-4">Based on check-ins shared with you.</Text>

          <Pressable
            onPress={sayHey}
            disabled={opening}
            accessibilityRole="button"
            className={`min-h-12 rounded-full items-center justify-center mt-4 active:opacity-85 ${primaryControl}`}
          >
            {opening ? (
              <ActivityIndicator color="#1a0f2e" />
            ) : (
              <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>Say hey</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}
