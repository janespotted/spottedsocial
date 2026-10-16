import { uploadPendingDmPhoto } from '@/lib/dm-photo';
import { pendingDm, readPendingDm, savePendingDm, deliverDm, type PendingDm } from '@/lib/dm-outbox';
import { getSessionUserId } from '@/lib/session-identity';
import { onPrivateViewsInvalidated, privateViewRevision } from '@/lib/private-views';
import { CaptureGuard } from '@/components/capture-guard';
import { openFriendCard, friendCardPress } from '@/lib/friend-card';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { withholdLivePreview } from '@/lib/live-preview';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { dismissKeyboardNow, useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { onNightBoundary } from '@/lib/night-boundary';
import { confirmMessage, sharedPostResults } from '@/lib/thread-state';
import { RESET_COPY } from '@/lib/reset-copy';
import { Image } from '@/components/styled';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareLegendList } from '@legendapp/list/keyboard';
import { KeyboardGestureArea, KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import {
  markThreadRead,
  fetchPeerReadReceipt,
  parseInvitePointer,
  SHARED_POST_REGEX,
  type DmMember,
  type DmMessage,
} from '@/lib/dm';
import { fetchProfilesSafe } from '@/lib/profiles';
import { resolveMuxPosters } from '@/lib/mux';
import { resolvePostImageUrl, resolvePostImageUrls } from '@/lib/posts';
import { getDemoSandbox } from '@/lib/demo-mode';
import { isFromTonight } from '@/lib/time-context';
import { useSession } from '@/hooks/use-session';
import { useTypingIndicator } from '@/hooks/use-typing-indicator';
import { useThreadInvites } from '@/hooks/use-thread-invites';
import { Avatar } from '@/components/avatar';
import { InviteCard } from '@/components/invite-card';
import { SpottedCamera } from '@/components/spotted-camera';
import { NEON } from '@/lib/theme';

interface SharedPostData {
  id: string;
  text: string;
  image_url: string | null;
  venue_name: string | null;
  author_name: string;
  author_id: string;
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

function ThreadScreenContent() {
  const params = useLocalSearchParams<{ threadId: string; title?: string; avatarUrl?: string }>();
  const threadId = params.threadId;
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id;

  // Leaving the thread (back, swipe, tab) closes the keyboard — it used to
  // stay pinned over the Messages list (addendum v3 §8.2).
  useDismissKeyboardOnLeave();

  // Push deep links / restored routes can land here with no history
  const goBack = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingDm[]>([]);
  const pendingRef = useRef<PendingDm[]>([]);
  const confirmedIds = useRef(new Set<string>());
  const updatePending = useCallback((rows: PendingDm[]) => {
    if (getSessionUserId() !== userId) return;
    rows = rows.filter(m => !confirmedIds.current.has(m.id) && isFromTonight(m.created_at));
    pendingRef.current = rows; setPendingMessages(rows);
    if (userId && threadId) void savePendingDm(userId, threadId, rows).catch(() => {});
  }, [userId, threadId]);
  useEffect(() => {
    let active = true;
    pendingRef.current = []; confirmedIds.current.clear(); setPendingMessages([]);
    if (userId && threadId) void readPendingDm(userId, threadId).then(rows => {
      if (active) updatePending([...rows.filter(m => !pendingRef.current.some(p => p.id === m.id)), ...pendingRef.current]);
    });
    return () => { active = false; };
  }, [userId, threadId, updatePending]);
  useEffect(() => onNightBoundary(() => updatePending([])), [updatePending]);

  const [memberMap, setMemberMap] = useState<Map<string, DmMember>>(new Map());
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [otherMember, setOtherMember] = useState<DmMember | null>(null);
  const [myName, setMyName] = useState('Someone');
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  const [sharedPosts, setSharedPosts] = useState<Map<string, SharedPostData | null>>(new Map());
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const refreshSharedPostsRef = useRef<() => void>(() => {});
  const refreshReceiptRef = useRef<() => void>(() => {});
  const [draft, setDraft] = useState('');
  const sendingRef = useRef(false);
  const draftRevision = useRef(0);
  const { data: own } = useOwnNightStatus();
  const withheld = withholdLivePreview(own?.status?.status, !!own);
  const [threadAccess, setThreadAccess] = useState<'loading' | 'allowed' | 'unavailable' | 'error'>('loading');
  const [metadataRevision, setMetadataRevision] = useState(0);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  // Ids already on screen — only messages arriving AFTER a fetch animate in
  const seenIdsRef = useRef<Set<string>>(new Set());
  const contentContainerStyle = useResolveClassNames('px-4 py-4');
  const { typingNames, setTyping } = useTypingIndicator(threadId, userId, memberMap);
  const { invites, responding, respond } = useThreadInvites(threadId, messages);

  /* ── Thread data: members, group info, read-receipt privacy ── */
  useEffect(() => {
    if (!threadId || !userId) { setThreadAccess('unavailable'); return; }
    let cancelled = false;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      const privacy = privateViewRevision();
      try {
      const [{ data: threadData, error: threadFailure }, { data: members, error: memberFailure }, profiles, { data: myProfile }] =
        await Promise.all([
          supabase
            .from('dm_threads')
            .select('is_group, name, group_avatar_url')
            .eq('id', threadId)
            .maybeSingle(),
          supabase
            .from('dm_thread_members')
            .select('user_id')
            .eq('thread_id', threadId)
            .neq('user_id', userId),
          // A transient RPC failure must not kill member loading — the
          // direct backfill below fills any gaps
          fetchProfilesSafe().catch(() => []),
          supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
        ]);
      if (cancelled || current !== request || privacy !== privateViewRevision()) return;
      if (threadFailure || memberFailure) throw threadFailure ?? memberFailure;
      if (!threadData) { setThreadAccess('unavailable'); setMessages([]); setMemberMap(new Map()); setOtherMember(null); setGroupInfo(null); return; }
      if (myProfile?.display_name) setMyName(myProfile.display_name);

      const memberIds = (members ?? []).map((m) => m.user_id);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const missing = memberIds.filter((id) => !profileMap.has(id));
      if (missing.length > 0) {
        const { data: fallback } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', missing);
        for (const p of fallback ?? []) profileMap.set(p.id, p as never);
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
          venue_name: withheld ? null : s?.venue_name ?? null,
          venue_id: withheld ? null : s?.venue_id ?? null,
        };
        newMap.set(id, member);
        allMembers.push(member);
      }
      if (cancelled || current !== request || privacy !== privateViewRevision()) return;
      setMemberMap(newMap);

      if (threadData?.is_group) {
        const avatar = await resolvePostImageUrl(threadData.group_avatar_url ?? null);
        if (cancelled || current !== request || privacy !== privateViewRevision()) return;
        setGroupInfo({
          name: threadData.name ?? null,
          group_avatar_url: avatar,
          members: allMembers,
        });
        setOtherMember(null);
      } else {
        setGroupInfo(null);
        setOtherMember(allMembers[0] ?? null);
      }
      setThreadAccess('allowed');
      } catch {
        if (!cancelled && current === request) { setThreadAccess('error'); setOtherMember(null); setGroupInfo(null); setMessages([]); }
      }
    };
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 5_000);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { setThreadAccess('loading'); void refresh(); }
    });
    return () => {
      cancelled = true; clearInterval(timer); foreground.remove();
    };
  }, [threadId, userId, withheld, metadataRevision]);

  // Returning from membership/photo controls refreshes the header immediately.
  useFocusEffect(useCallback(() => { setMetadataRevision(n => n + 1); }, [threadId]));

  // RLS exposes peer receipts only when both users currently opt in. Refresh
  // on focus/foreground and while visible so preference revocation clears Seen.
  useFocusEffect(useCallback(() => {
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      setOtherReadAt(null);
      if (!threadId || !otherMember?.user_id || !userId || groupInfo) return;
      const receipt = await fetchPeerReadReceipt(threadId, otherMember.user_id);
      if (active && request === generation) setOtherReadAt(receipt);
    };
    refreshReceiptRef.current = () => { void refresh(); };
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh(); else { ++generation; setOtherReadAt(null); }
    });
    return () => { active = false; ++generation; clearInterval(timer); subscription.remove(); refreshReceiptRef.current = () => {}; setOtherReadAt(null); };
  }, [threadId, userId, otherMember?.user_id, groupInfo]));

  // After each commit, everything rendered counts as seen (entrance
  // animations only fire at row mount, so live arrivals animate once)
  useEffect(() => {
    for (const m of messages) seenIdsRef.current.add(m.id);
  }, [messages]);

  /* ── Messages: fetch + realtime ── */
  const fetchMessages = useCallback(async () => {
    if (!threadId) return;
    const privacy = privateViewRevision();
    const { data, error } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (privacy !== privateViewRevision()) return;
    if (error) { setMessages([]); setThreadError('Could not load messages.'); return; }
    if (!data) return;
    const tonight = data.filter((m) => isFromTonight(m.created_at)) as DmMessage[];
    for (const m of tonight) confirmedIds.current.add(m.id);
    updatePending(pendingRef.current);
    // Fetched history must not play entrance animations — only live arrivals
    for (const m of tonight) seenIdsRef.current.add(m.id);
    setMessages(tonight);
    // Resolve media to the authenticated gateway (including legacy public URLs)
    const pathMsgs = tonight.filter((m) => m.image_url);
    for (const msg of pathMsgs) {
      const url = await resolvePostImageUrl(msg.image_url);
      if (privacy !== privateViewRevision()) return;
      if (url) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, image_url: url } : m))
        );
      }
    }
  }, [threadId, updatePending]);

  useEffect(() => onPrivateViewsInvalidated(() => {
    setMessages([]); setSharedPosts(new Map()); setMemberMap(new Map());
    setOtherMember(null); setGroupInfo(null); setOtherReadAt(null);
    setThreadAccess('loading'); setMetadataRevision(n => n + 1);
    void fetchMessages();
  }), [fetchMessages]);

  // At 5 AM the night's messages are gone — re-read rather than keep
  // showing them (addendum v3 §4). Messages live in local state, so the
  // query invalidation in handleNightBoundary cannot reach them.
  useEffect(() => onNightBoundary(() => { setMessages([]); setSharedPosts(new Map()); void fetchMessages(); }), [fetchMessages]);

  useEffect(() => {
    if (!threadId || !userId || threadAccess !== 'allowed') return;
    // Rejoining an open group restores tonight's history; removal also tears
    // down its live subscription instead of leaving a stale conversation.
    fetchMessages();
    markThreadRead(threadId, userId);

    const teardown = createResilientChannel({
      name: `thread-${threadId}`,
      // Refetch the gap after a reconnect/foreground; a message that arrived
      // while disconnected would otherwise be missing until screen re-mount.
      onReconnect: fetchMessages,
      configure: (ch) => ch
        .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const privacy = privateViewRevision();
          const newMsg = payload.new as DmMessage;
          if (newMsg.image_url) {
            newMsg.image_url = await resolvePostImageUrl(newMsg.image_url);
          }
          // A media lookup may finish after the local 5 AM boundary.
          if (!isFromTonight(newMsg.created_at)) return;
          if (privacy !== privateViewRevision()) return;
          confirmedIds.current.add(newMsg.id);
          updatePending(pendingRef.current);
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
        () => {
          refreshReceiptRef.current();
        }
      ),
    });

    return teardown;
  }, [threadId, userId, fetchMessages, threadAccess]);

  /* ── My reactions on visible messages ── */
  useEffect(() => {
    if (messages.length === 0 || !userId) return;
    (async () => {
      const { data } = await supabase
        .from('dm_message_reactions' as never)
        .select('message_id')
        .in(
          'message_id',
          messages.filter((m) => !m.id.startsWith('optimistic')).map((m) => m.id)
        )
        .eq('user_id', userId);
      if (data) {
        setHearted(new Set((data as Array<{ message_id: string }>).map((r) => r.message_id)));
      }
    })();
  }, [messages.length, userId]);

  /* Revalidate on focus and on a bounded timer, independent of the result map.
   * A missing/revoked post is a stable unavailable result, not a new fetch trigger. */
  const sharedPostIds = [...new Set(messages.map(m => m.text.match(SHARED_POST_REGEX)?.[1]).filter(Boolean))].sort().join(',');
  useFocusEffect(useCallback(() => {
    let active = true;
    let generation = 0;
    const ids = sharedPostIds ? sharedPostIds.split(',') : [];
    const refresh = async () => {
      const request = ++generation;
      const privacy = privateViewRevision();
      // Keep the previous results on screen until the new ones replace them.
      if (!ids.length) { setSharedPosts(new Map()); return; }
      try {
        const [{ data: posts, error }, profiles] = await Promise.all([
          supabase.from('posts').select('id,text,image_url,media_type,mux_playback_id,venue_name,user_id').in('id', ids),
          fetchProfilesSafe(),
        ]);
        if (error) throw error;
        const profileMap = new Map(profiles.map(p => [p.id, p]));
        const isMux = (p: { media_type: string | null; image_url: string | null; mux_playback_id: string | null }) =>
          p.media_type === 'video' && !p.image_url && !!p.mux_playback_id;
        const [images, posters] = await Promise.all([
          resolvePostImageUrls((posts ?? []).filter(p => !isMux(p)).map(p => p.image_url)),
          resolveMuxPosters((posts ?? []).filter(isMux).map(p => p.mux_playback_id!), 480),
        ]);
        const resolved = (posts ?? []).map(p => ({
          id: p.id, text: p.text, venue_name: p.venue_name,
          author_id: p.user_id,
          author_name: profileMap.get(p.user_id)?.display_name ?? 'Someone',
          image_url: isMux(p) ? posters.get(p.mux_playback_id!) ?? null : p.image_url ? images.get(p.image_url) ?? null : null,
        }));
        if (active && request === generation && privacy === privateViewRevision()) setSharedPosts(sharedPostResults(ids, resolved));
      } catch {
        if (active && request === generation) {
          setSharedPosts(sharedPostResults(ids, []));
          setThreadError('Could not refresh shared posts.');
        }
      }
    };
    refreshSharedPostsRef.current = () => { void refresh(); };
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const boundary = onNightBoundary(() => { ++generation; setSharedPosts(new Map()); });
    return () => { active = false; ++generation; clearInterval(timer); boundary(); refreshSharedPostsRef.current = () => {}; setSharedPosts(new Map()); };
  }, [sharedPostIds]));

  /* ── Send ── */
  const retryMessage = async (message: PendingDm) => {
    if (sendingRef.current || !isFromTonight(message.created_at)) return;
    sendingRef.current = true;
    if (message.localAsset) setUploading(true);
    updatePending(pendingRef.current.map(m => m.id === message.id ? { ...m, failed: false } : m));
    try {
      if (message.localAsset && !message.image_url) message = await uploadPendingDmPhoto(message);
      if (getSessionUserId() !== userId) return;
      updatePending(pendingRef.current.map(m => m.id === message.id ? { ...message, failed: false } : m));
      const saved = await deliverDm(message);
      if (getSessionUserId() !== userId) return;
      const image = saved.image_url ? message.localAsset ?? await resolvePostImageUrl(saved.image_url) : null;
      confirmedIds.current.add(saved.id);
      updatePending(pendingRef.current.filter(m => m.id !== message.id));
      setMessages(prev => confirmMessage(prev, message.id, { ...saved, image_url: image }, isFromTonight(saved.created_at)));
    } catch {
      updatePending(pendingRef.current.map(m => m.id === message.id ? { ...m, failed: true } : m));
    } finally { sendingRef.current = false; setUploading(false); }
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || !userId || !threadId || text.length > 2000 || sendingRef.current) return;
    const message = pendingDm(userId, threadId, text);
    updatePending([...pendingRef.current, message]);
    setDraft('');
    await retryMessage(message);
  };

  /** Upload + send one image, whatever produced it (camera or library). */
  const sendImageAsset = useCallback(
    async (asset: { uri: string; mimeType?: string | null }) => {
    if (!userId || !threadId || sendingRef.current) return;
    const imageMessage: PendingDm = { ...pendingDm(userId, threadId, ''), localAsset: asset.uri, localMimeType: asset.mimeType ?? 'image/jpeg' };
    updatePending([...pendingRef.current, imageMessage]);
    await retryMessage(imageMessage);
    },
    [userId, threadId, updatePending]
  );

  /**
   * Attach: the Spotted camera or the library (addendum v3 §11.8 — the
   * original composer had a camera affordance, not just a picker).
   */
  const attachImage = useCallback(() => {
    dismissKeyboardNow();
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Take a photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2 },
      async (index) => {
        if (index === 0) {
          dismissKeyboardNow();
          setCameraOpen(true);
          return;
        }
        if (index !== 1) return;
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        const asset = result.assets?.[0];
        if (!result.canceled && asset) void sendImageAsset(asset);
      }
    );
  }, [sendImageAsset]);

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
            .from('dm_message_reactions' as never)
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', userId)
        : await supabase
            .from('dm_message_reactions' as never)
            .insert({ message_id: messageId, user_id: userId, reaction: '❤️' } as never);
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
    if (!groupInfo || !threadId) return;
    router.push({ pathname: '/group-members', params: { threadId } });
  };

  const renameGroup = () => {
    if (!groupInfo || !threadId) return;
    Alert.prompt(
      'Group name',
      undefined,
      async (name) => {
        const newName = name?.trim() || null;
        if (newName && [...newName].length > 100) {
          Alert.alert('Name too long', 'Use 100 characters or fewer.'); return;
        }
        try {
          const { data, error } = await supabase
            .from('dm_threads')
            .update({ name: newName })
            .eq('id', threadId)
            .select('id, name')
            .single();
          if (error || !data) throw error ?? new Error('Group unavailable');
          setGroupInfo((prev) => (prev ? { ...prev, name: data.name } : prev));
        } catch {
          Alert.alert('Could not rename group', 'Your change was not saved. Please try again.');
        }
      },
      'plain-text',
      groupInfo.name ?? ''
    );
  };

  const changeGroupPhoto = async () => {
    if (!threadId) return;
    const demo = getDemoSandbox();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    try {
      if (getDemoSandbox() !== demo) return;
      if (demo) {
        const key = demo.saveGroupPhoto(threadId, asset.uri);
        setGroupInfo(prev => prev ? { ...prev, group_avatar_url: demo.resolveMedia(key) } : prev);
        return;
      }
      const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `group-avatars/${threadId}/private-v1/${Date.now()}.${ext}`;
      const body = await fetch(asset.uri).then((r) => r.arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from('post-images')
        .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (uploadErr) throw uploadErr;
      const { data, error } = await supabase
        .from('dm_threads')
        .update({ group_avatar_url: path })
        .eq('id', threadId)
        .select('id, group_avatar_url')
        .single();
      if (error || !data) throw error ?? new Error('Group unavailable');
      // Signing authorizes the stored group photo, so persist the key first.
      const mediaUrl = await resolvePostImageUrl(data.group_avatar_url);
      setGroupInfo((prev) => (prev ? { ...prev, group_avatar_url: mediaUrl } : prev));
    } catch {
      Alert.alert('Could not update group photo', 'Please try again.');
    }
  };

  const showGroupOptions = () => {
    if (!groupInfo) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Group Members', 'Rename Group', 'Change Group Photo', 'Cancel'],
        cancelButtonIndex: 3,
      },
      (index) => {
        if (index === 0) showGroupMembers();
        if (index === 1) renameGroup();
        if (index === 2) changeGroupPhoto();
      }
    );
  };

  const headerTitle = groupInfo
    ? (groupInfo.name ??
      (groupInfo.members
        .map((m) => m.display_name.split(' ')[0])
        .slice(0, 3)
        .join(', ') || 'Group chat'))
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

  const openSharedPost = (id: string) => router.push({ pathname: '/post-detail', params: { postId: id } });

  if (threadAccess !== 'allowed') return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text className="text-white">{threadAccess === 'loading' ? 'Loading conversation…' : threadAccess === 'error' ? 'Could not load this conversation.' : 'This conversation is unavailable.'}</Text>
      {threadAccess === 'error' ? <Text className="text-[#d4ff00]" onPress={() => setMetadataRevision(x => x + 1)}>Retry</Text> : null}
      <Text className="text-white" onPress={goBack}>Back to messages</Text>
    </View>
  );

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={groupInfo ? 'Group options' : 'View friend card'}
          onPress={groupInfo ? showGroupOptions : friendCardPress(otherMember?.user_id, userId)}
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
            ) : !withheld && otherMember?.venue_name ? (
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

      {/* A slim system row under the name: the thread survives the reset,
          the messages don't (addendum v3 §3) */}
      <View className="px-4 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
        <Text className="text-white/45 text-[11px] font-sans text-center">
          {RESET_COPY.dmThread}
        </Text>
      </View>

      {/* Messages — KeyboardAwareLegendList is LegendList wired to
          KeyboardChatScrollView (keyboard-controller chat-app guide):
          content lifts with the keyboard, interactive swipe-to-dismiss */}
      <KeyboardGestureArea
        interpolator="ios"
        textInputNativeID="dm-input"
        style={{ flex: 1 }}
      >
      {threadError ? <Pressable onPress={() => { setThreadError(null); void fetchMessages(); refreshSharedPostsRef.current(); }} className="px-4 py-2"><Text className="text-red-300">{threadError} Tap to refresh.</Text></Pressable> : null}
      <KeyboardAwareLegendList
        data={[...messages, ...pendingMessages.filter(p => !messages.some(m => m.id === p.id))].sort((a,b) => a.created_at.localeCompare(b.created_at))}
        keyExtractor={(m: DmMessage) => m.id}
        // Rows run a one-shot FadeInDown gated on seenIdsRef; a recycled row
        // would replay or skip that animation against the wrong message.
        recycleItems={false}
        contentContainerStyle={contentContainerStyle}
        ListEmptyComponent={
          <View className="items-center py-16 px-8 gap-2">
            <SymbolView name="bubble.left.and.bubble.right" size={28} tintColor="rgba(168,85,247,0.6)" />
            <Text className="text-white/55 text-sm font-sans text-center">
              Say something — the night&apos;s just started.
            </Text>
            <Text className="text-white/40 text-xs font-sans text-center">
              {RESET_COPY.dmEmpty}
            </Text>
          </View>
        }
        alignItemsAtEnd
        maintainScrollAtEnd
        maintainScrollAtEndThreshold={0.2}
        keyboardDismissMode="interactive"
        keyboardOffset={insets.bottom}
        // The animated LegendList variant freezes mounted rows unless
        // extraData invalidates them — everything renderItem reads from
        // component state must be listed here
        extraData={{ memberMap, otherMember, hearted, sharedPosts, otherReadAt, invites, responding }}
        renderItem={({ item, index }: { item: DmMessage; index: number }) => {
          const isMine = item.sender_id === userId;
          const isNew = !seenIdsRef.current.has(item.id);
          const sender = !isMine ? memberMap.get(item.sender_id) : null;
          const showSeen =
            isMine &&
            item.id === lastSentByMeId &&
            !groupInfo &&
            !!otherReadAt &&
            new Date(otherReadAt) >= new Date(item.created_at);
          const postMatch = item.text.match(SHARED_POST_REGEX);
          const sharedPost = postMatch ? sharedPosts.get(postMatch[1]) : null;
          const pointer = parseInvitePointer(item.text);
          const inviteId = pointer?.id;
          // A sent card names the receiver; a received one names the sender
          const otherName = isMine
            ? otherMember?.display_name
            : (sender?.display_name ?? otherMember?.display_name);

          return (
            <Animated.View
              entering={isNew ? FadeInDown.springify().damping(20).stiffness(250) : undefined}
            >
            <View className="mb-2.5">
              {/* Everything here is tonight's, so the thread opens with
                  "Tonight"; an invite card carries its own time. */}
              {index === 0 ? (
                <Text className="text-white/55 text-xs font-sans text-center py-2">
                  {inviteId ? 'Tonight' : `Tonight · ${timeLabel(item.created_at)}`}
                </Text>
              ) : needsTimestamp(messages[index - 1], item) && !inviteId ? (
                <Text className="text-white/55 text-xs font-sans text-center py-2">
                  {timeLabel(item.created_at)}
                </Text>
              ) : null}
              {pointer && inviteId ? (
                <View className={`flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <View className="max-w-[85%]">
                    <InviteCard
                      kind={pointer.kind}
                      invite={invites.get(inviteId)}
                      isMine={isMine}
                      onOpenPerson={() => openFriendCard(isMine ? invites.get(inviteId)?.receiver_id ?? otherMember?.user_id ?? '' : item.sender_id, userId)}
                      otherFirstName={otherName?.split(' ')[0] || (isMine ? 'them' : 'Someone')}
                      createdAt={item.created_at}
                      busy={responding.has(inviteId)}
                      onRespond={(accept) => void respond(inviteId, accept)}
                      onOpenVenue={(venueId) => router.push({ pathname: '/venue', params: { venueId } })}
                    />
                  </View>
                </View>
              ) : (
              <View className={`flex-row items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                {!isMine ? (
                  <Avatar
                    userId={item.sender_id}
                    name={sender?.display_name ?? otherMember?.display_name ?? '?'}
                    url={sender?.avatar_url ?? otherMember?.avatar_url ?? null}
                    size="sm"
                  />
                ) : null}
                <View className="max-w-[75%]">
                  {groupInfo && !isMine && sender ? (
                    <Text className="text-white/50 text-xs font-sans mb-1 ml-1" onPress={friendCardPress(item.sender_id, userId)} accessibilityRole="button">
                      {sender.display_name.split(' ')[0]}
                    </Text>
                  ) : null}

                  {postMatch ? (
                    sharedPost ? (
                      <Pressable
                        onPress={() => openSharedPost(sharedPost.id)}
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
                          <Text className="text-white text-xs font-sans-semibold mb-0.5" onPress={friendCardPress(sharedPost.author_id, userId)} accessibilityRole="button">
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
                        <Text className="text-sm font-sans italic text-white/50">Post unavailable or expired</Text>
                      </View>
                    )
                  ) : (
                    <Pressable
                      onPress={() => onMessageTap(item.id)}
                      className={`rounded-2xl overflow-hidden ${
                        isMine ? 'bg-[#4c2f6e] rounded-br-sm' : 'bg-white/95 rounded-bl-sm'
                      }`}
                    >
                      {item.image_url || (item as PendingDm).localAsset ? (
                        <Image
                          source={{ uri: (item as PendingDm).localAsset ?? item.image_url ?? undefined }}
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
              )}
              {pendingMessages.some(p => p.id === item.id) && !messages.some(m => m.id === item.id) ? <View className="flex-row justify-end gap-3">
                {pendingMessages.find(p => p.id === item.id)?.failed ? <><Pressable accessibilityRole="button" accessibilityLabel="Retry this message" onPress={() => void retryMessage(pendingMessages.find(p => p.id === item.id)!)} className="min-h-11 justify-center"><Text className="text-[#d4ff00] text-xs font-sans">Not sent · Retry</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Discard unsent message" onPress={() => updatePending(pendingRef.current.filter(p => p.id !== item.id))} className="min-h-11 justify-center"><Text className="text-white/50 text-xs">Discard</Text></Pressable></> : <Text accessibilityLiveRegion="polite" className="text-white/50 text-xs py-2">Sending…</Text>}
              </View> : null}
              {showSeen ? (
                <Text className="text-white/55 text-xs font-sans text-right mt-1 mr-1">Seen</Text>
              ) : null}
            </View>
            </Animated.View>
          );
        }}
      />
      </KeyboardGestureArea>

      {/* Typing indicator */}
      {typingNames.length > 0 ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <Text className="text-white/50 text-sm font-sans px-4 py-1.5">
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.join(', ')} are typing...`}
          </Text>
        </Animated.View>
      ) : null}

      {/* Composer */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View className="border-t border-white/10 bg-[#110a24]">
          <View className="flex-row items-center gap-3 px-4 py-3 pb-safe-offset-3">
            <Pressable
              onPress={attachImage}
              accessibilityRole="button"
              accessibilityLabel="Attach photo"
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
              nativeID="dm-input"
              value={draft}
              onChangeText={(text) => {
              draftRevision.current += 1;
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
              accessibilityRole="button"
              accessibilityLabel="Send message"
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

      {/* Spotted camera over the thread — same capture UI as the composer */}
      {cameraOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <SpottedCamera
            closeLabel="Cancel"
            onClose={() => setCameraOpen(false)}
            onCapture={(media) => {
              setCameraOpen(false);
              // Videos aren't supported in DMs yet — photos only
              if (media.type !== 'image') return;
              void sendImageAsset({ uri: media.uri, mimeType: media.mimeType });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function ThreadScreen() { return <CaptureGuard name="thread"><ThreadScreenContent /></CaptureGuard>; }
