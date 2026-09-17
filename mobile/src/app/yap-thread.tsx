import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from '@/components/styled';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LegendList } from '@legendapp/list/react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import {
  fetchPinnedVenueMessages,
  fetchVenueYaps,
  fetchYapComments,
  postYap,
  postYapComment,
  voteOnYap,
  YAP_COOLDOWN_MS,
  type YapComment,
  type YapMessage,
} from '@/lib/yap';
import { useSession } from '@/hooks/use-session';
import { NEON } from '@/lib/theme';

const relativeTime = (dateStr: string) => {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
};

function VoteColumn({
  yap,
  onVote,
}: {
  yap: YapMessage;
  onVote: (yap: YapMessage, type: 'up' | 'down') => void;
}) {
  return (
    <View className="items-center gap-0.5 w-8">
      <Pressable onPress={() => onVote(yap, 'up')} hitSlop={6} className="active:scale-125">
        <SymbolView
          name="arrowtriangle.up.fill"
          size={14}
          tintColor={yap.user_vote === 'up' ? NEON : 'rgba(255,255,255,0.3)'}
        />
      </Pressable>
      <Text
        className={`text-xs font-sans-semibold tabular-nums ${
          yap.user_vote === 'up'
            ? 'text-[#d4ff00]'
            : yap.user_vote === 'down'
              ? 'text-[#a855f7]'
              : 'text-white/50'
        }`}
      >
        {yap.score}
      </Text>
      <Pressable onPress={() => onVote(yap, 'down')} hitSlop={6} className="active:scale-125">
        <SymbolView
          name="arrowtriangle.down.fill"
          size={14}
          tintColor={yap.user_vote === 'down' ? '#a855f7' : 'rgba(255,255,255,0.3)'}
        />
      </Pressable>
    </View>
  );
}

/** Anonymous venue chat room. Port of the web VenueYapThread (media deferred). */
export default function YapThreadScreen() {
  useDismissKeyboardOnLeave();
  const { venueName } = useLocalSearchParams<{ venueName: string }>();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  // Push deep links / restored routes can land here with no history
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [posting, setPosting] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const lastPostRef = useRef(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, YapComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const contentContainerStyle = useResolveClassNames('pb-32');

  const { data: messages, refetch } = useQuery({
    queryKey: ['venue-yaps', venueName, userId],
    enabled: !!userId && !!venueName,
    queryFn: () => fetchVenueYaps(venueName!, userId!),
  });

  const { data: pinned } = useQuery({
    queryKey: ['venue-pinned', venueName],
    enabled: !!venueName,
    queryFn: () => fetchPinnedVenueMessages(venueName!),
  });

  // canPost: checked in at THIS venue right now (party threads carry the
  // night_statuses id so party yaps tag party_id + GPS like the web)
  const { data: postContext } = useQuery({
    queryKey: ['yap-can-post', venueName, userId],
    enabled: !!userId && !!venueName,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('night_statuses')
        .select('id, venue_name, status, is_private_party')
        .eq('user_id', userId!)
        .eq('status', 'out')
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      const here = data?.venue_name?.toLowerCase() === venueName!.toLowerCase();
      if (!here || !data?.is_private_party) return { canPost: here, party: null };
      // Party coordinates live in party_locations (close friends only); the
      // host reads their own row.
      const { data: party } = await supabase
        .from('party_locations')
        .select('lat, lng')
        .eq('user_id', userId!)
        .maybeSingle();
      return {
        canPost: here,
        party: { id: data.id, lat: party?.lat ?? null, lng: party?.lng ?? null },
      };
    },
  });
  const canPost = postContext?.canPost ?? false;

  // Realtime: new yaps at this venue
  useEffect(() => {
    if (!venueName) return;
    return createResilientChannel({
      name: `yap-${venueName}`,
      onReconnect: () => refetch(),
      configure: (ch) =>
        ch.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'yap_messages',
            filter: `venue_name=eq.${venueName}`,
          },
          () => refetch()
        ),
    });
  }, [venueName, refetch]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, YAP_COOLDOWN_MS - (Date.now() - lastPostRef.current));
      setCooldownLeft(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft > 0]);

  // One vote in flight per yap: a double-tap used to fire two requests
  // (addendum v3 §8.5). Optimistic delta first, then the server's score.
  const votingRef = useRef<Set<string>>(new Set());
  const handleVote = async (yap: YapMessage, type: 'up' | 'down') => {
    if (!userId || votingRef.current.has(yap.id)) return;
    votingRef.current.add(yap.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const key = ['venue-yaps', venueName, userId];
    queryClient.setQueryData<YapMessage[]>(key, (prev) =>
      (prev ?? []).map((m) => {
        if (m.id !== yap.id) return m;
        const delta =
          yap.user_vote === type ? (type === 'up' ? -1 : 1) : yap.user_vote ? (type === 'up' ? 2 : -2) : type === 'up' ? 1 : -1;
        return { ...m, score: m.score + delta, user_vote: yap.user_vote === type ? null : type };
      })
    );
    try {
      const { score, vote } = await voteOnYap(yap.id, type);
      queryClient.setQueryData<YapMessage[]>(key, (prev) =>
        (prev ?? []).map((m) => (m.id === yap.id ? { ...m, score, user_vote: vote } : m))
      );
    } catch {
      refetch(); // revert to server truth
    } finally {
      votingRef.current.delete(yap.id);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) setPendingImage(asset);
  };

  const handlePost = async () => {
    if (!userId || !venueName || posting) return;
    const text = draft.trim();
    if (!text && !pendingImage) return;
    const sinceLast = Date.now() - lastPostRef.current;
    if (lastPostRef.current && sinceLast < YAP_COOLDOWN_MS) return;
    setPosting(true);
    try {
      let imagePath: string | null = null;
      if (pendingImage) {
        const ext = pendingImage.mimeType === 'image/png' ? 'png' : 'jpg';
        imagePath = `${userId}/yap/${Date.now()}.${ext}`;
        const body = await fetch(pendingImage.uri).then((r) => r.arrayBuffer());
        const { error: uploadErr } = await supabase.storage
          .from('post-images')
          .upload(imagePath, body, {
            contentType: pendingImage.mimeType ?? 'image/jpeg',
            upsert: true,
          });
        if (uploadErr) throw uploadErr;
      }
      await postYap(userId, venueName, text, imagePath, postContext?.party ?? null);
      lastPostRef.current = Date.now();
      setCooldownLeft(YAP_COOLDOWN_MS);
      setDraft('');
      setPendingImage(null);
      Keyboard.dismiss(); // a posted yap ends the input (addendum v3 §8.2)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['yap-directory'] });
    } catch {
      /* upload/post failed — keep draft for retry */
    } finally {
      setPosting(false);
    }
  };

  const toggleComments = async (yapId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(yapId)) next.delete(yapId);
      else next.add(yapId);
      return next;
    });
    if (!comments[yapId]) {
      const fetched = await fetchYapComments(yapId);
      setComments((prev) => ({ ...prev, [yapId]: fetched }));
    }
  };

  const sendComment = async (yapId: string) => {
    if (!userId) return;
    const text = (commentDrafts[yapId] ?? '').trim();
    if (!text) return;
    setCommentDrafts((prev) => ({ ...prev, [yapId]: '' }));
    await postYapComment(yapId, userId, text);
    const fetched = await fetchYapComments(yapId);
    setComments((prev) => ({ ...prev, [yapId]: fetched }));
    refetch();
  };

  const showModeration = (yap: YapMessage) => {
    if (!userId || yap.user_id === userId) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Report Yap', 'Block User', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      async (index) => {
        if (index === 0) {
          await supabase
            .from('reports')
            .insert({
              reporter_id: userId,
              reported_yap_id: yap.id,
              reason: 'user_reported',
            } as never);
        }
        if (index === 1) {
          const { error } = await supabase
            .from('blocked_users')
            .insert({ blocker_id: userId, blocked_id: yap.user_id });
          if (!error || (error as { code?: string }).code === '23505') refetch();
        }
      }
    );
  };

  const cooldownSecs = Math.ceil(cooldownLeft / 1000);

  return (
    <View className="flex-1">
      {/* Header */}
      <View
        className="pt-safe-offset-3 pb-3 px-4 flex-row items-center gap-3 border-b border-white/10"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}
      >
        <Pressable onPress={goBack} hitSlop={8} className="active:opacity-60">
          <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-white font-sans-semibold text-base" numberOfLines={1}>
            {venueName}
          </Text>
          <Text className="text-white/55 text-xs font-sans">Anonymous · resets 5am</Text>
        </View>
        {/* The decorative mic that sat here read as a record button that did
            nothing ("What's the mic?", addendum v3 §8.9) — removed. */}
      </View>

      <LegendList
        data={messages ?? []}
        keyExtractor={(y) => y.id}
        // Rows read expanded/comments/commentDrafts from component state and
        // pass no extraData, so recycled rows would show stale comment
        // sections. Remount-on-reuse until that state is wired to extraData.
        recycleItems={false}
        contentContainerStyle={contentContainerStyle}
        // Taps on a row (vote, comments) land on the first tap while the
        // keyboard is up; dragging the list closes it (addendum v3 §8.2)
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          (pinned ?? []).length > 0 ? (
            <View className="px-4 pt-3 gap-2">
              {(pinned ?? []).slice(0, 2).map((msg) => (
                <View
                  key={msg.id}
                  className="rounded-xl px-3 py-2.5 bg-[#d4ff00]/10 border border-[#d4ff00]/25 flex-row items-start gap-2"
                >
                  <SymbolView name="pin.fill" size={12} tintColor={NEON} />
                  <Text className="text-white/90 text-sm font-sans flex-1">{msg.text}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center py-20 px-8">
            <Text className="text-white/50 text-sm font-sans text-center">
              No yaps here yet tonight. {canPost ? 'Start it off.' : ''}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onLongPress={() => showModeration(item)}
            className={`px-4 py-3 ${index > 0 ? 'border-t border-white/[0.06]' : ''}`}
          >
            <View className="flex-row gap-3">
              <VoteColumn yap={item} onVote={handleVote} />
              <View className="flex-1 min-w-0">
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    className="w-full aspect-[4/3] rounded-xl mb-2"
                    contentFit="cover"
                  />
                ) : null}
                <Text className="text-white text-[15px] font-sans leading-snug">{item.text}</Text>
                <View className="flex-row items-center gap-2 mt-1.5">
                  <Text className="text-white/45 text-xs font-sans">
                    {item.author_handle ?? 'Anonymous'} · {relativeTime(item.created_at)}
                  </Text>
                  <Pressable
                    onPress={() => toggleComments(item.id)}
                    hitSlop={6}
                    className="flex-row items-center gap-1 ml-auto active:opacity-70"
                  >
                    <SymbolView name="bubble.left" size={12} tintColor="rgba(255,255,255,0.4)" />
                    <Text className="text-white/55 text-xs font-sans">
                      {item.comments_count > 0 ? item.comments_count : ''}
                    </Text>
                  </Pressable>
                </View>

                {/* Inline comments */}
                {expanded.has(item.id) ? (
                  <View className="mt-2 pl-2 border-l border-white/10 gap-2">
                    {(comments[item.id] ?? []).map((c) => (
                      <View key={c.id}>
                        <Text className="text-white/80 text-sm font-sans">{c.text}</Text>
                        <Text className="text-white/40 text-[11px] font-sans">
                          {c.author_handle ?? 'Anonymous'} · {relativeTime(c.created_at)}
                        </Text>
                      </View>
                    ))}
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        value={commentDrafts[item.id] ?? ''}
                        onChangeText={(t) =>
                          setCommentDrafts((prev) => ({ ...prev, [item.id]: t }))
                        }
                        placeholder="Reply..."
                        placeholderTextColorClassName="accent-white/30"
                        maxLength={280}
                        className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white text-sm font-sans"
                      />
                      <Pressable
                        onPress={() => sendComment(item.id)}
                        disabled={!(commentDrafts[item.id] ?? '').trim()}
                        hitSlop={6}
                        className="disabled:opacity-30"
                      >
                        <SymbolView name="arrow.up.circle.fill" size={24} tintColor={NEON} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Composer — gated on being checked in here */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View className="border-t border-white/10 bg-[#110a24]">
          {canPost ? (
            <View className="px-4 py-3 pb-safe-offset-3">
              {pendingImage ? (
                <View className="flex-row items-center gap-2 mb-2">
                  <Image
                    source={{ uri: pendingImage.uri }}
                    className="w-14 h-14 rounded-lg"
                    contentFit="cover"
                  />
                  <Pressable onPress={() => setPendingImage(null)} hitSlop={8}>
                    <SymbolView name="xmark.circle.fill" size={18} tintColor="rgba(255,255,255,0.5)" />
                  </Pressable>
                </View>
              ) : null}
              <View className="flex-row items-center gap-3">
              <Pressable
                onPress={pickImage}
                disabled={posting}
                hitSlop={6}
                className="w-9 h-9 rounded-full items-center justify-center bg-white/5 border border-white/15 active:opacity-70 disabled:opacity-30"
              >
                <SymbolView name="photo" size={15} tintColor="rgba(255,255,255,0.6)" />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={`Yap anonymously at ${venueName}...`}
                placeholderTextColorClassName="accent-white/30"
                multiline
                maxLength={280}
                className="flex-1 min-h-10 max-h-24 rounded-2xl bg-white/5 border border-white/15 px-4 py-2.5 text-white text-[15px] font-sans"
              />
              <Pressable
                onPress={handlePost}
                disabled={(!draft.trim() && !pendingImage) || posting || cooldownLeft > 0}
                hitSlop={8}
                className="min-w-10 min-h-10 px-2 rounded-full items-center justify-center disabled:opacity-30"
                style={{ backgroundColor: NEON }}
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#1a0f2e" />
                ) : cooldownLeft > 0 ? (
                  <Text className="text-[#1a0f2e] text-xs font-sans-semibold">{cooldownSecs}s</Text>
                ) : (
                  <SymbolView name="arrow.up" size={18} tintColor="#1a0f2e" weight="semibold" />
                )}
              </Pressable>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center gap-2 px-4 py-3.5 pb-safe-offset-3">
              <SymbolView name="lock" size={14} tintColor="rgba(255,255,255,0.4)" />
              <Text className="text-white/50 text-sm font-sans flex-1" numberOfLines={1}>
                Check in at {venueName} to yap
              </Text>
              <Pressable
                onPress={() => router.push('/check-in')}
                className="px-3 py-1.5 rounded-full active:opacity-90"
                style={{ backgroundColor: NEON }}
              >
                <Text className="text-[#1a0f2e] text-xs font-sans-semibold">Update status</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardStickyView>
    </View>
  );
}
