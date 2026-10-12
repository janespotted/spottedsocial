import { parseConfirmationPeople, parseNotificationIds, parseThreadIds } from '@/lib/route-input';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { createDmThread } from '@/lib/dm';
import { withdrawInvites } from '@/lib/dm-invites';
import { openFriendCard } from '@/lib/friend-card';
import { showToast } from '@/lib/toast';
import { useSession } from '@/hooks/use-session';

export interface SentConfirmationParams {
  kind: 'invites' | 'meetup';
  /** JSON: [{ id, display_name, avatar_url }] — the people just contacted */
  friends: string;
  venueName?: string;
  /** JSON: invite ids the send created (Undo withdraws them) */
  inviteIds: string;
  /** JSON: { friendId: threadId }, the thread each card landed in */
  threadIds: string;
}

/** Compact confirmation with Undo, Chat, and recipient profile links. */
export default function SentConfirmationScreen() {
  const params = useLocalSearchParams<Record<keyof SentConfirmationParams, string>>();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  // The route is a transparent modal with no native animation; the fade in
  // and fade out are driven here so both directions are visible and smooth.
  const reveal = useSharedValue(0);
  const closing = useRef(false);
  useEffect(() => {
    reveal.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.quad) });
  }, [reveal]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ scale: 0.97 + 0.03 * reveal.value }],
  }));

  const kind = params.kind === 'meetup' ? 'meetup' : 'invites';
  const friends = parseConfirmationPeople(params.friends);
  const inviteIds = parseNotificationIds(params.inviteIds);
  const threadIds = parseThreadIds(params.threadIds);
  const first = friends[0];

  const pop = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    reveal.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(pop)();
    });
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await withdrawInvites(inviteIds);
    close();
    setTimeout(
      () =>
        showToast(
          ok
            ? kind === 'meetup'
              ? 'Meet up request undone'
              : `Invite${friends.length > 1 ? 's' : ''} undone`
            : "Couldn't undo — they may have already answered"
        ),
      350
    );
  };

  const chat = async () => {
    if (!first || busy) return;
    setBusy(true);
    try {
      const threadId = threadIds[first.id] ?? (await createDmThread(first.id));
      close();
      setTimeout(
        () =>
          router.push({
            pathname: '/thread',
            params: { threadId, title: first.display_name, avatarUrl: first.avatar_url ?? '' },
          }),
        300
      );
    } catch {
      setBusy(false);
    }
  };

  const openPerson = (id: string) => { close(); setTimeout(() => openFriendCard(id, session?.user.id), 350); };

  if (!friends.length || !inviteIds.length) return <View className="flex-1 items-center justify-center bg-[#110a24] p-6 gap-4">
    <Text className="text-white">This confirmation is unavailable. Check Activity or your conversation for the current result.</Text>
    <Text className="text-[#d4ff00]" onPress={pop}>Back</Text>
  </View>;

  return <View className="flex-1 justify-end pb-safe-offset-6 px-4">
    <Pressable onPress={close} accessibilityLabel="Close confirmation" className="absolute inset-0" />
    <Animated.View style={cardStyle} className="bg-[#251739] rounded-2xl border border-white/15 p-4 gap-3">
      <Text accessibilityRole="alert" className="text-white text-base font-sans-semibold">{kind === 'meetup' ? 'Meet Up sent' : 'Invites sent'}</Text>
      <Text className="text-white/60 text-sm font-sans">{friends.map((p,i) => <Text key={p.id} onPress={() => openPerson(p.id)} accessibilityRole="button">{i ? ', ' : ''}{p.display_name}</Text>)} · until 5am</Text>
      <View className="flex-row gap-4"><Pressable accessibilityRole="button" onPress={undo} disabled={busy} className="min-h-11 justify-center"><Text className="text-white/75 font-sans-medium">Undo</Text></Pressable><Pressable accessibilityRole="button" onPress={chat} disabled={busy || !first} className="min-h-11 justify-center"><Text className="text-[#d4ff00] font-sans-semibold">Open chat</Text></Pressable><View className="flex-1" /><Pressable accessibilityRole="button" accessibilityLabel="Close confirmation" onPress={close} className="min-h-11 min-w-11 items-center justify-center"><SymbolView name="xmark" tintColor="white" size={17} /></Pressable></View>
    </Animated.View>
  </View>;
}
