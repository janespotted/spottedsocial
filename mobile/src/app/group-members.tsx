import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { usePrivateQuery } from '@/hooks/use-private-query';
import { useSession } from '@/hooks/use-session';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { fetchProfilesSafe } from '@/lib/profiles';
import { addGroupMembers, fetchGroupMembers, removeGroupMember } from '@/lib/group-members';
import { MAX_GROUP_FRIENDS } from '@/lib/dm';
import { friendCardPress } from '@/lib/friend-card';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

export default function GroupMembersSheet() {
  return <SafeAreaProvider style={{ flex: 1 }}><GroupMembersContent /></SafeAreaProvider>;
}

function GroupMembersContent() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const group = usePrivateQuery({
    queryKey: ['group-members', userId, threadId],
    enabled: !!userId && !!threadId,
    refetchInterval: focused ? 5000 : false,
    queryFn: () => fetchGroupMembers(threadId),
  });
  const friendship = useFriendIds(userId);
  const friends = usePrivateQuery({
    queryKey: ['new-group-friends', userId, friendship.data ?? []],
    enabled: !!userId && friendship.data !== undefined,
    queryFn: async () => {
      const ids = new Set(friendship.data ?? []);
      return (await fetchProfilesSafe()).filter(p => ids.has(p.id) && p.id !== userId && !p.is_demo)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });
  const isCreator = group.data?.created_by === userId;
  const members = group.data?.members ?? [];
  const available = useMemo(() => (friends.data ?? []).filter(f => !members.some(m => m.id === f.id)), [friends.data, members]);
  const selectedIds = selected.filter(id => available.some(f => f.id === id));
  const capacity = Math.max(0, MAX_GROUP_FRIENDS + 1 - members.length);
  const q = term.trim().replace(/^@/, '').toLowerCase();
  const rows = adding ? available.filter(f => !q || f.display_name.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q)) : members;
  const friendsFailed = friendship.isError || friends.isError;
  const friendsLoading = friendship.isLoading || friends.isLoading;
  const canAdd = isCreator && !group.isError && !friendsFailed && !friendsLoading && selectedIds.length > 0 && selectedIds.length <= capacity && !busy;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['group-members', userId, threadId] }),
      queryClient.invalidateQueries({ queryKey: ['dm-threads', userId] }),
    ]);
  };

  const addSelected = async () => {
    if (!canAdd || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); Keyboard.dismiss();
    try {
      await addGroupMembers(threadId, selectedIds);
      await refresh();
      if (mounted.current) { setSelected([]); setTerm(''); setAdding(false); }
    } catch (e) {
      if (mounted.current) setError((e as { code?: string }).code === '42501'
        ? 'These friends can’t join this group. Update your selection and try again.'
        : 'Couldn’t add your friends. Please try again.');
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!isCreator || id === userId || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await removeGroupMember(threadId, id); await refresh(); }
    catch { if (mounted.current) setError('Couldn’t remove this person. Please try again.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const confirmRemove = (person: { id: string; display_name: string }) => Alert.alert(
    `Remove ${person.display_name}?`, 'They’ll lose access to this group.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void remove(person.id); } }],
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View className="px-5 pb-4 flex-row items-center justify-between" style={{ paddingTop: Math.max(insets.top, 16) }}>
        <Text className="text-white text-xl font-sans-semibold">{adding ? 'Add friends' : 'Group members'}</Text>
        <Pressable disabled={busy} onPress={() => { if (adding) { setAdding(false); setTerm(''); setSelected([]); setError(null); Keyboard.dismiss(); } else router.back(); }} accessibilityRole="button" accessibilityLabel={adding ? 'Back to group members' : 'Done with group members'} className="min-h-11 justify-center px-2 active:opacity-60">
          <Text className="text-white/60 text-base font-sans">{adding ? 'Back' : 'Done'}</Text>
        </Pressable>
      </View>
      {group.isLoading ? <ActivityIndicator color={NEON} /> : group.isError || !group.data ? (
        <View className="px-5 gap-3"><Text className="text-white/60 font-sans">{group.isError ? 'Couldn’t load this group.' : 'This group is unavailable.'}</Text>
          {group.isError ? <Text className="text-[#d4ff00]" onPress={() => { void group.refetch(); }}>Retry</Text> : null}</View>
      ) : <>
        {!adding && isCreator ? <Pressable disabled={busy || capacity === 0} onPress={() => { setAdding(true); setError(null); }} accessibilityRole="button" accessibilityLabel="Add group members" className="mx-5 mb-3 min-h-12 rounded-2xl bg-white/5 flex-row items-center px-4 gap-3 active:opacity-60">
          <SymbolView name="person.badge.plus" size={20} tintColor={NEON} /><Text className="text-[#d4ff00] text-base font-sans-medium">{capacity ? 'Add friends' : 'Group is full'}</Text>
        </Pressable> : null}
        {adding ? <View className="mx-5 mb-3 px-3 flex-row items-center gap-2 rounded-2xl border border-white/15">
          <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.45)" />
          <TextInput value={term} onChangeText={setTerm} editable={!busy} placeholder="Search friends" accessibilityLabel="Search friends to add" placeholderTextColorClassName="accent-white/35" autoCapitalize="none" autoCorrect={false} className="flex-1 min-h-12 py-3 text-white text-base font-sans" />
        </View> : null}
        <Text className="px-5 pb-3 text-white/45 text-xs font-sans">{adding ? 'New members can see tonight’s messages.' : `${members.length} members`}</Text>
        <FlatList data={adding && friendsFailed ? [] : rows} keyExtractor={p => p.id} className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }} extraData={[selected, busy]}
          ListEmptyComponent={friendsLoading && adding ? <ActivityIndicator color={NEON} /> : <View className="py-6 gap-3 items-center"><Text className="text-white/55 font-sans">{friendsFailed ? 'Couldn’t load your friends.' : q ? 'No friends match that.' : 'All your friends are already here.'}</Text>{friendsFailed ? <Text className="text-[#d4ff00]" onPress={() => { void friendship.refetch(); void friends.refetch(); }}>Retry</Text> : null}</View>}
          renderItem={({ item }) => {
            const checked = selectedIds.includes(item.id);
            const disabled = busy || (!checked && selectedIds.length >= capacity);
            return <View className="flex-row items-center gap-3 py-2.5">
              <Avatar name={item.display_name} url={item.avatar_url} userId={busy ? undefined : item.id} size="md" />
              <View className="flex-1 min-w-0"><Text onPress={busy ? undefined : friendCardPress(item.id, userId)} accessibilityRole="button" className="text-white text-base font-sans-medium" numberOfLines={1}>{item.id === userId ? `${item.display_name} (you)` : item.display_name}</Text>{item.id === group.data?.created_by ? <Text className="text-white/40 text-xs font-sans">Creator</Text> : null}</View>
              {adding ? <Pressable disabled={disabled} onPress={() => { setError(null); setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id]); }} accessibilityRole="checkbox" accessibilityLabel={`Select ${item.display_name}`} accessibilityState={{ checked, disabled }} className="min-w-12 min-h-12 items-center justify-center">
                <View className={`w-6 h-6 rounded-full border items-center justify-center ${checked ? 'bg-[#d4ff00] border-[#d4ff00]' : 'border-white/30'}`} style={{ opacity: disabled && !checked ? 0.35 : 1 }}>{checked ? <SymbolView name="checkmark" size={14} tintColor="#1a0f2e" weight="bold" /> : null}</View>
              </Pressable> : isCreator && item.id !== userId ? <Pressable disabled={busy} onPress={() => confirmRemove(item)} accessibilityRole="button" accessibilityLabel={`Remove ${item.display_name}`} className="min-h-11 px-2 justify-center active:opacity-60"><Text className="text-[#ffb4b4] text-sm font-sans">Remove</Text></Pressable> : null}
            </View>;
          }} />
      </>}
      <View className="px-5 pt-3 gap-3" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        {error ? <Text accessibilityRole="alert" className="text-[#ffb4b4] text-sm font-sans">{error}</Text> : null}
        {adding ? <Pressable disabled={!canAdd} onPress={addSelected} accessibilityRole="button" accessibilityLabel="Add selected friends" accessibilityState={{ disabled: !canAdd, busy }} className="min-h-12 rounded-full items-center justify-center py-3 px-4 active:opacity-80" style={{ backgroundColor: NEON, opacity: canAdd || busy ? 1 : 0.35 }}>
          {busy ? <ActivityIndicator color="#1a0f2e" /> : <Text className="text-[#1a0f2e] text-base font-sans-semibold">{selectedIds.length ? `Add ${selectedIds.length} ${selectedIds.length === 1 ? 'friend' : 'friends'}` : 'Choose friends'}</Text>}
        </Pressable> : busy ? <ActivityIndicator color={NEON} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}
