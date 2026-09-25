import { parseConfirmationPeople, parseNotificationIds } from '@/lib/route-input';
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
import { useResolveClassNames } from 'uniwind';
import { createDmThread } from '@/lib/dm';
import { undoNotifications } from '@/lib/venue-invites';
import { openFriendCard } from '@/lib/friend-card';
import { showToast } from '@/lib/toast';
import { Avatar } from '@/components/avatar';
import { Confetti } from '@/components/confetti';
import { SpottedMark } from '@/components/spotted-mark';
import { useSession } from '@/hooks/use-session';
import { NEON } from '@/lib/theme';

export interface SentConfirmationParams {
  kind: 'invites' | 'meetup';
  /** JSON: [{ id, display_name, avatar_url }] — the people just contacted */
  friends: string;
  venueName?: string;
  /** JSON: notification ids the send created (Undo deletes them) */
  notificationIds: string;
}

interface Person {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

function joinNames(people: Person[]): string {
  if (people.length === 0) return 'nobody';
  if (people.length === 1) return people[0].display_name;
  if (people.length === 2) return `${people[0].display_name} and ${people[1].display_name}`;
  return `${people[0].display_name}, ${people[1].display_name}, +${people.length - 2} more`;
}

/**
 * The original build's celebratory success card, restored (addendum v3
 * §1 / §11.6): "Invites Sent!" after venue invites and "You sent a Meet Up
 * Request to X!" after a meet-up, with the recipient avatar, the S mark,
 * brief Spotted-coloured confetti, and circular Undo + Chat actions. Undo
 * deletes the notification rows the send created (web parity). Tapping the
 * backdrop closes it. Copy carries the 5am rule (addendum v3 §3).
 */
export default function SentConfirmationScreen() {
  const params = useLocalSearchParams<Record<keyof SentConfirmationParams, string>>();
  const { session } = useSession();
  const gradient = useResolveClassNames('bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]');
  const cardGradient = useResolveClassNames('bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8]');
  const [busy, setBusy] = useState(false);

  // The route is a transparent modal with no native animation; the fade in
  // and fade out are driven here so both directions are visible and smooth.
  const reveal = useSharedValue(0);
  const closing = useRef(false);
  useEffect(() => {
    reveal.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.quad) });
  }, [reveal]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ scale: 0.97 + 0.03 * reveal.value }],
  }));

  const kind = params.kind === 'meetup' ? 'meetup' : 'invites';
  const friends = parseConfirmationPeople(params.friends);
  const notificationIds = parseNotificationIds(params.notificationIds);
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
    const ok = await undoNotifications(notificationIds);
    close();
    setTimeout(
      () =>
        showToast(
          ok
            ? kind === 'meetup'
              ? 'Meet up request undone'
              : `Invite${friends.length > 1 ? 's' : ''} undone`
            : "Couldn't undo — it may already be read"
        ),
      350
    );
  };

  const chat = async () => {
    if (!first || busy) return;
    setBusy(true);
    try {
      const threadId = await createDmThread(first.id);
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

  const headline = kind === 'meetup' ? `You sent a Meet Up Request to ${first?.display_name ?? 'them'}!` : 'Invites Sent!';

  if (!friends.length || !notificationIds.length) return <View className="flex-1 items-center justify-center bg-[#110a24] p-6 gap-4">
    <Text className="text-white">This confirmation is unavailable. Check Activity or your conversation for the current result.</Text>
    <Text className="text-[#d4ff00]" onPress={pop}>Back</Text>
  </View>;

  return (
    <Animated.View className="flex-1" style={backdropStyle}>
    <Pressable onPress={close} className="flex-1 items-center justify-center px-5" style={gradient}>
      {/* Plain fade + a hair of scale: a spring zoom plus a 40 pt blurred
          shadow, re-rendered under moving confetti, read as flicker */}
      <Animated.View
        className="w-full max-w-[420px] rounded-3xl p-8"
        style={[
          cardGradient,
          {
            shadowColor: '#8b5cf6',
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 6 },
          },
          cardStyle,
        ]}
        onStartShouldSetResponder={() => true}
      >
        {/* Recipient avatar (opens their card) — top left, as in the original */}
        {first ? (
          <Pressable
            onPress={() => {
              close();
              setTimeout(() => openFriendCard(first.id, session?.user.id), 350);
            }}
            className="absolute top-4 left-4 active:opacity-80"
            accessibilityLabel={first.display_name}
          >
            <View className="rounded-full border-2 border-[#2d1b4e]">
              <Avatar name={first.display_name} url={first.avatar_url} size="md" />
            </View>
          </Pressable>
        ) : null}
        {/* S mark — top right */}
        <View className="absolute top-4 right-4">
          <SpottedMark size={40} />
        </View>

        <View className="items-center pt-6">
          <Text className="text-6xl mb-3" accessibilityElementsHidden>
            🥳
          </Text>
          <Text className="text-white text-2xl font-sans-semibold text-center mb-2">{headline}</Text>
          {kind === 'invites' ? (
            <Text className="text-white/80 text-[15px] font-sans text-center leading-5">
              You invited <Text style={{ color: NEON }} className="font-sans-semibold">{joinNames(friends)}</Text> to{' '}
              <Text style={{ color: NEON }} className="font-sans-semibold">{params.venueName ?? 'the spot'}</Text>
            </Text>
          ) : (
            <Text className="text-white/80 text-[15px] font-sans text-center leading-5">
              Your request is in their Activity. Push delivery depends on their settings.
            </Text>
          )}
          <Text className="text-white/60 text-xs font-sans mt-2">
            {kind === 'meetup' ? 'Meet up sent · expires at 5am' : 'Expires at 5am'}
          </Text>

          {/* Circular actions */}
          <View className="flex-row items-center justify-center gap-8 mt-8">
            <Pressable onPress={undo} disabled={busy} className="items-center gap-1 active:opacity-80">
              <View className="w-16 h-16 rounded-full bg-white/20 items-center justify-center">
                <SymbolView name="arrow.uturn.backward" size={26} tintColor="#ffffff" />
              </View>
              <Text className="text-white/90 text-xs font-sans-medium">Undo</Text>
            </Pressable>
            <Pressable onPress={chat} disabled={busy || !first} className="items-center gap-1 active:opacity-80">
              <View className="w-16 h-16 rounded-full bg-white/20 items-center justify-center">
                <SymbolView name="bubble.left.fill" size={26} tintColor="#ffffff" />
              </View>
              <Text className="text-white/90 text-xs font-sans-medium">Chat</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      <Text className="text-white/40 text-xs font-sans mt-6">Tap anywhere to close</Text>
      {/* Above the card, like the original's canvas layer */}
      <Confetti count={90} duration={2600} />
    </Pressable>
    </Animated.View>
  );
}
