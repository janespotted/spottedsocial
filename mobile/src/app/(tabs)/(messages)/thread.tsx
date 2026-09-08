import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
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
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo-mode';
import {
  markThreadRead,
  notifyDmRecipients,
  SHARED_POST_REGEX,
  type DmMember,
  type DmMessage,
} from '@/lib/dm';
import { fetchProfilesSafe } from '@/lib/profiles';
import { resolvePostImageUrl } from '@/lib/posts';
import { isFromTonight } from '@/lib/time-context';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';

const NEON = '#d4ff00';

interface SharedPostData {
  id: string;
  text: string;
  image_url: string | null;
  venue_name: string | null;
  author_name: string;
}

interface GroupInfo {
  name: string | null;
  group_avatar_url: string | null;
  members: DmMember[];
}

/** >5 min gap starts a new timestamp group (web messageGroups parity) */
function needsTimestamp(prev: DmMessage | undefined, msg: DmMessage): boolean {
  if (!prev) return true;
  return (
    Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) >
    5 * 60 * 1000
  );
}

function timeLabel(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ threadId: string; title?: string; avatarUrl?: string }>();
  const threadId = params.threadId;
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id;

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, DmMember>>(new Map());
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [otherMember, setOtherMember] = useState<DmMember | null>(null);
  const [myName, setMyName] = useState('Someone');
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  const [sharedPosts, setSharedPosts] = useState<Map<string, SharedPostData>>(new Map());
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [bothShowReceipts, setBothShowReceipts] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memberMapRef = useRef(memberMap);
  memberMapRef.current = memberMap;
  const contentContainerStyle = useResolveClassNames('px-4 py-4');

  /* ── Thread data: members, group info, read-receipt privacy ── */
  useEffect(() => {
    if (!threadId || !userId) return;
    let cancelled = false;
    (async () => {
      const [{ data: threadData }, { data: members }, profiles, { data: myProfile }] =
        await Promise.all([
          supabase
            .from('dm_threads')
            .select('is_group, name, group_avatar_url')
            .eq('id', threadId)
            .single(),
          supabase
            .from('dm_thread_members')
            .select('user_id')
            .eq('thread_id', threadId)
            .neq('user_id', userId),
          fetchProfilesSafe(),
          supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
        ]);
      if (cancelled) return;
      if (myProfile?.display_name) setMyName(myProfile.display_name);

      const memberIds = (members ?? []).map((m) => m.user_id);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      if (DEMO_MODE) {
        const missing = memberIds.filter((id) => !profileMap.has(id));
        if (missing.length > 0) {
          const { data: fallback } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', missing);
          for (const p of fallback ?? []) profileMap.set(p.id, p as never);
        }
      }

      const { data: statuses } = memberIds.length
        ? await supabase
            .from('night_statuses')
            .select('user_id, venue_name, venue_id')
            .in('user_id', memberIds)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString())
        : { data: [] };
      const statusMap = new Map((statuses ?? []).map((s) => [s.user_id, s]));

      const newMap = new Map<string, DmMember>();
      const allMembers: DmMember[] = [];
      for (const id of memberIds) {
        const p = profileMap.get(id);
        const s = statusMap.get(id);
        const member: DmMember = {
          user_id: id,
          display_name: p?.display_name ?? 'Unknown',
          username: (p as { username?: string })?.username ?? '',
          avatar_url: p?.avatar_url ?? null,
          venue_name: s?.venue_name ?? null,
          venue_id: s?.venue_id ?? null,
        };
        newMap.set(id, member);
        allMembers.push(member);
      }
      if (cancelled) return;
      setMemberMap(newMap);

      if (threadData?.is_group) {
        setGroupInfo({
          name: threadData.name ?? null,
          group_avatar_url: threadData.group_avatar_url ?? null,
          members: allMembers,
        });
        setOtherMember(null);
      } else {
        setGroupInfo(null);
        setOtherMember(allMembers[0] ?? null);
        // "Seen" only when BOTH users share read receipts
        const otherId = allMembers[0]?.user_id;
        if (otherId) {
          const { data: privacy } = await supabase
            .from('profiles')
            .select('show_read_receipts')
            .in('id', [userId, otherId]);
          if (!cancelled) {
            setBothShowReceipts(
              (privacy?.length ?? 0) === 2 && (privacy ?? []).every((p) => p.show_read_receipts)
            );
          }
          const { data: receipt } = await supabase
            .from('dm_read_receipts')
            .select('last_read_at')
            .eq('thread_id', threadId)
            .eq('user_id', otherId)
            .maybeSingle();
          if (!cancelled && receipt) setOtherReadAt(receipt.last_read_at);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, userId]);

  /* ── Messages: fetch + realtime ── */
  const fetchMessages = useCallback(async () => {
    if (!threadId) return;
    const { data } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (!data) return;
    const tonight = data.filter((m) => isFromTonight(m.created_at)) as DmMessage[];
    setMessages(tonight);
    // Resolve storage paths to signed URLs (mobile uploads store paths)
    const pathMsgs = tonight.filter((m) => m.image_url && !m.image_url.startsWith('http'));
    for (const msg of pathMsgs) {
      const url = await resolvePostImageUrl(msg.image_url);
      if (url) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, image_url: url } : m))
        );
      }
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !userId) return;
    fetchMessages();
    markThreadRead(threadId, userId);

    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const newMsg = payload.new as DmMessage;
          if (newMsg.image_url && !newMsg.image_url.startsWith('http')) {
            newMsg.image_url = await resolvePostImageUrl(newMsg.image_url);
          }
          setMessages((prev) =>
            prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]
          );
          if (newMsg.sender_id !== userId) markThreadRead(threadId, userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_read_receipts',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as { user_id?: string; last_read_at?: string } | null;
          if (row?.user_id && row.user_id !== userId && row.last_read_at) {
            setOtherReadAt(row.last_read_at);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_typing_indicators',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const row = (payload.new ?? payload.old) as { user_id?: string } | null;
          if (row?.user_id === userId) return;
          const fiveSecsAgo = new Date(Date.now() - 5000).toISOString();
          const { data } = await supabase
            .from('dm_typing_indicators' as never)
            .select('user_id, updated_at')
            .eq('thread_id', threadId)
            .neq('user_id', userId)
            .gt('updated_at', fiveSecsAgo);
          const names = ((data ?? []) as Array<{ user_id: string }>).map(
            (r) => memberMapRef.current.get(r.user_id)?.display_name.split(' ')[0] ?? 'Someone'
          );
          setTypingNames((prev) => (prev.length === 0 && names.length === 0 ? prev : names));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Clean up own typing indicator on leave
      supabase
        .from('dm_typing_indicators' as never)
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .then(() => {});
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    };
  }, [threadId, userId, fetchMessages]);

  /* ── My reactions on visible messages ── */
  useEffect(() => {
    if (messages.length === 0 || !userId) return;
    (async () => {
      const { data } = await supabase
        .from('dm_message_reactions')
        .select('message_id')
        .in(
          'message_id',
          messages.filter((m) => !m.id.startsWith('optimistic')).map((m) => m.id)
        )
        .eq('user_id', userId);
      if (data) setHearted(new Set(data.map((r) => r.message_id)));
    })();
  }, [messages.length, userId]);

  /* ── Shared post cards ── */
  useEffect(() => {
    const ids = [
      ...new Set(
        messages
          .map((m) => m.text.match(SHARED_POST_REGEX)?.[1])
          .filter((id): id is string => !!id && !sharedPosts.has(id))
      ),
    ];
    if (ids.length === 0) return;
    (async () => {
      const [{ data: posts }, profiles] = await Promise.all([
        supabase.from('posts').select('id, text, image_url, venue_name, user_id').in('id', ids),
        fetchProfilesSafe(),
      ]);
      if (!posts) return;
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const resolved = await Promise.all(
        posts.map(async (p) => ({ ...p, image_url: await resolvePostImageUrl(p.image_url) }))
      );
      setSharedPosts((prev) => {
        const next = new Map(prev);
        for (const p of resolved) {
          next.set(p.id, {
            id: p.id,
            text: p.text,
            image_url: p.image_url,
            venue_name: p.venue_name,
            author_name: profileMap.get(p.user_id)?.display_name ?? 'Someone',
          });
        }
        return next;
      });
    })();
  }, [messages, sharedPosts]);

  /* ── Typing indicator (mine) ── */
  const setTyping = useCallback(() => {
    if (!threadId || !userId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    if (typingClearRef.current) clearTimeout(typingClearRef.current);
    supabase
      .from('dm_typing_indicators' as never)
      .upsert({
        thread_id: threadId,
        user_id: userId,
        updated_at: new Date().toISOString(),
      } as never)
      .then(() => {});
    typingClearRef.current = setTimeout(() => {
      supabase
        .from('dm_typing_indicators' as never)
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .then(() => {});
    }, 4000);
  }, [threadId, userId]);

  /* ── Send ── */
  const recipientIds = groupInfo
    ? groupInfo.members.map((m) => m.user_id)
    : otherMember
      ? [otherMember.user_id]
      : [];

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !userId || !threadId || text.length > 2000) return;
    setDraft('');
    const optimistic: DmMessage = {
      id: `optimistic-${Date.now()}`,
      thread_id: threadId,
      sender_id: userId,
      text,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const { data: inserted, error } = await supabase
      .from('dm_messages')
      .insert({ thread_id: threadId, sender_id: userId, text })
      .select()
      .single();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === optimistic.id ? (inserted as DmMessage) : m))
    );
    notifyDmRecipients(userId, myName.split(' ')[0], recipientIds, text);
  }, [draft, userId, threadId, myName, recipientIds]);

  const sendImage = useCallback(async () => {
    if (!userId || !threadId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    setUploading(true);
    const optimisticId = `optimistic-img-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        thread_id: threadId,
        sender_id: userId,
        text: '',
        image_url: asset.uri,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${userId}/dm/${threadId}/${Date.now()}.${ext}`;
      const body = await fetch(asset.uri).then((r) => r.arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from('post-images')
        .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: inserted, error: insertErr } = await supabase
        .from('dm_messages')
        .insert({ thread_id: threadId, sender_id: userId, text: '', image_url: path })
        .select()
        .single();
      if (insertErr) throw insertErr;
      // Keep the local uri for display — the stored value is a private path
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...(inserted as DmMessage), image_url: asset.uri } : m
        )
      );
      notifyDmRecipients(userId, myName.split(' ')[0], recipientIds, '📷 Photo');
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setUploading(false);
    }
  }, [userId, threadId, myName, recipientIds]);

  /* ── Reactions: double-tap to heart ── */
  const toggleHeart = useCallback(
    async (messageId: string) => {
      if (!userId || messageId.startsWith('optimistic')) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const isHearted = hearted.has(messageId);
      setHearted((prev) => {
        const next = new Set(prev);
        if (isHearted) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
      const { error } = isHearted
        ? await supabase
            .from('dm_message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', userId)
        : await supabase
            .from('dm_message_reactions')
            .insert({ message_id: messageId, user_id: userId, reaction: '❤️' });
      if (error) {
        setHearted((prev) => {
          const next = new Set(prev);
          if (isHearted) next.add(messageId);
          else next.delete(messageId);
          return next;
        });
      }
    },
    [userId, hearted]
  );

  const onMessageTap = useCallback(
    (messageId: string) => {
      const now = Date.now();
      if (
        lastTapRef.current &&
        lastTapRef.current.id === messageId &&
        now - lastTapRef.current.time < 300
      ) {
        toggleHeart(messageId);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { id: messageId, time: now };
      }
    },
    [toggleHeart]
  );

  const showGroupMembers = () => {
    if (!groupInfo) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: groupInfo.name ?? 'Members',
        options: [
          ...groupInfo.members.map((m) =>
            m.venue_name ? `${m.display_name} — @ ${m.venue_name}` : m.display_name
          ),
          'Close',
        ],
        cancelButtonIndex: groupInfo.members.length,
      },
      () => {}
    );
  };

  const headerTitle = groupInfo
    ? (groupInfo.name ??
      groupInfo.members
        .map((m) => m.display_name.split(' ')[0])
        .slice(0, 3)
        .join(', '))
    : (otherMember?.display_name ?? params.title ?? '');
  const headerAvatar = groupInfo
    ? groupInfo.group_avatar_url
    : (otherMember?.avatar_url ?? (params.avatarUrl || null));

  const lastSentByMeId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === userId) return messages[i].id;
    }
    return null;
  })();

  return (
    <View className="flex-1">
      {/* Header */}
      <View
        className="pt-safe-offset-3 pb-3 px-4 flex-row items-center gap-3 border-b border-white/10"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} className="active:opacity-60">
          <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <Pressable
          onPress={groupInfo ? showGroupMembers : undefined}
          className="flex-1 flex-row items-center gap-3"
        >
          {groupInfo && !headerAvatar ? (
            <View className="w-10 h-10 rounded-full bg-[#1a0f2e] border-2 border-white/20 items-center justify-center">
              <SymbolView name="person.2.fill" size={16} tintColor="#a855f7" />
            </View>
          ) : (
            <Avatar name={headerTitle || '?'} url={headerAvatar} size="sm" />
          )}
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-semibold text-base" numberOfLines={1}>
              {headerTitle}
            </Text>
            {groupInfo ? (
              <Text className="text-white/60 text-xs font-sans">
                {groupInfo.members.length + 1} members
              </Text>
            ) : otherMember?.venue_name ? (
              <Pressable
                onPress={() =>
                  otherMember.venue_id &&
                  router.push({
                    pathname: '/venue',
                    params: { venueId: otherMember.venue_id },
                  })
                }
                hitSlop={4}
              >
                <Text className="text-[#d4ff00] text-xs font-sans-medium" numberOfLines={1}>
                  @ {otherMember.venue_name}
                </Text>
              </Pressable>
            ) : otherMember?.username ? (
              <Text className="text-white/60 text-xs font-sans" numberOfLines={1}>
                @{otherMember.username}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>

      {/* Messages */}
      <LegendList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={contentContainerStyle}
        alignItemsAtEnd
        maintainScrollAtEnd
        maintainScrollAtEndThreshold={0.2}
        renderItem={({ item, index }) => {
          const isMine = item.sender_id === userId;
          const sender = !isMine ? memberMap.get(item.sender_id) : null;
          const showSeen =
            isMine &&
            item.id === lastSentByMeId &&
            !groupInfo &&
            bothShowReceipts &&
            !!otherReadAt &&
            new Date(otherReadAt) >= new Date(item.created_at);
          const postMatch = item.text.match(SHARED_POST_REGEX);
          const sharedPost = postMatch ? sharedPosts.get(postMatch[1]) : null;

          return (
            <View className="mb-2.5">
              {needsTimestamp(messages[index - 1], item) ? (
                <Text className="text-white/40 text-xs font-sans text-center py-2">
                  {timeLabel(item.created_at)}
                </Text>
              ) : null}
              <View className={`flex-row items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                {!isMine ? (
                  <Avatar
                    name={sender?.display_name ?? otherMember?.display_name ?? '?'}
                    url={sender?.avatar_url ?? otherMember?.avatar_url ?? null}
                    size="sm"
                  />
                ) : null}
                <View className="max-w-[75%]">
                  {groupInfo && !isMine && sender ? (
                    <Text className="text-white/50 text-xs font-sans mb-1 ml-1">
                      {sender.display_name.split(' ')[0]}
                    </Text>
                  ) : null}

                  {postMatch ? (
                    sharedPost ? (
                      <Pressable
                        onPress={() => onMessageTap(item.id)}
                        className={`rounded-2xl overflow-hidden border ${
                          isMine ? 'border-[#a855f7]/30 bg-[#4c2f6e]/50' : 'border-white/20 bg-white/10'
                        }`}
                      >
                        {sharedPost.image_url ? (
                          <Image
                            source={{ uri: sharedPost.image_url }}
                            className="w-60 aspect-[4/3]"
                            contentFit="cover"
                          />
                        ) : null}
                        <View className="px-3 py-2">
                          <Text className="text-white text-xs font-sans-semibold mb-0.5">
                            {sharedPost.author_name}
                          </Text>
                          {sharedPost.text ? (
                            <Text className="text-white/80 text-xs font-sans" numberOfLines={2}>
                              {sharedPost.text}
                            </Text>
                          ) : null}
                          {sharedPost.venue_name ? (
                            <Text className="text-[#d4ff00] text-[10px] font-sans mt-1">
                              @ {sharedPost.venue_name}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ) : (
                      <View
                        className={`rounded-2xl px-4 py-2.5 ${
                          isMine ? 'bg-[#4c2f6e] rounded-br-sm' : 'bg-white/95 rounded-bl-sm'
                        }`}
                      >
                        <Text className="text-sm font-sans italic text-white/50">Shared post</Text>
                      </View>
                    )
                  ) : (
                    <Pressable
                      onPress={() => onMessageTap(item.id)}
                      className={`rounded-2xl overflow-hidden ${
                        isMine ? 'bg-[#4c2f6e] rounded-br-sm' : 'bg-white/95 rounded-bl-sm'
                      }`}
                    >
                      {item.image_url ? (
                        <Image
                          source={{ uri: item.image_url }}
                          className="w-60 aspect-[4/3]"
                          contentFit="cover"
                        />
                      ) : null}
                      {item.text ? (
                        <Text
                          className={`text-sm font-sans leading-5 px-4 py-2.5 ${
                            isMine ? 'text-white' : 'text-[#1a0f2e]'
                          }`}
                        >
                          {item.text}
                        </Text>
                      ) : null}
                    </Pressable>
                  )}

                  {hearted.has(item.id) ? (
                    <Text className={`text-sm -mt-1.5 ${isMine ? 'text-right mr-1' : 'ml-1'}`}>
                      ❤️
                    </Text>
                  ) : null}
                </View>
              </View>
              {showSeen ? (
                <Text className="text-white/40 text-xs font-sans text-right mt-1 mr-1">Seen</Text>
              ) : null}
            </View>
          );
        }}
      />

      {/* Typing indicator */}
      {typingNames.length > 0 ? (
        <Text className="text-white/50 text-sm font-sans px-4 py-1.5">
          {typingNames.length === 1
            ? `${typingNames[0]} is typing...`
            : `${typingNames.join(', ')} are typing...`}
        </Text>
      ) : null}

      {/* Composer */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View className="border-t border-white/10 bg-[#110a24]">
          <View className="flex-row items-center gap-3 px-4 py-3 pb-safe-offset-3">
            <Pressable
              onPress={sendImage}
              disabled={uploading}
              hitSlop={6}
              className="w-9 h-9 rounded-full items-center justify-center bg-white/5 border border-white/15 active:opacity-70 disabled:opacity-30"
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <SymbolView name="photo" size={16} tintColor="rgba(255,255,255,0.6)" />
              )}
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (text.length > 0) setTyping();
              }}
              placeholder="Message..."
              placeholderTextColorClassName="accent-white/30"
              multiline
              maxLength={2000}
              className="flex-1 min-h-10 max-h-24 rounded-2xl bg-white/5 border border-white/15 px-4 py-2.5 text-white text-[15px] font-sans"
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim()}
              hitSlop={8}
              className="w-10 h-10 rounded-full items-center justify-center disabled:opacity-30"
              style={{ backgroundColor: NEON }}
            >
              <SymbolView name="arrow.up" size={18} tintColor="#1a0f2e" weight="semibold" />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
