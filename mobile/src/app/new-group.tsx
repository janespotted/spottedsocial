import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrivateQuery } from '@/hooks/use-private-query';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { createGroupThread, MAX_GROUP_FRIENDS } from '@/lib/dm';
import { fetchProfilesSafe, type SafeProfile } from '@/lib/profiles';
import { friendCardPress } from '@/lib/friend-card';
import { NEON } from '@/lib/theme';

export default function NewGroupSheet() {
  return <SafeAreaProvider style={{ flex: 1 }}><GroupComposer /></SafeAreaProvider>;
}

function GroupComposer() {
  const { session } = useSession();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const friendship = useFriendIds(userId);
  const [term, setTerm] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const profiles = usePrivateQuery({
    queryKey: ['new-group-friends', userId, friendship.data ?? []],
    enabled: !!userId && friendship.data !== undefined,
    queryFn: async () => {
      if (!friendship.data?.length) return [];
      const ids = new Set(friendship.data);
      return (await fetchProfilesSafe())
        .filter(p => ids.has(p.id) && p.id !== userId && !p.is_demo)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });
  const friends = profiles.data ?? [];
  const selectedFriends = friends.filter(f => selected.includes(f.id));
  const failed = friendship.isError || profiles.isError;
  const loading = friendship.isLoading || (!!friendship.data && profiles.isLoading);
  const canCreate = !!userId && !failed && !loading && !creating && selectedFriends.length >= 2;
  const matches = useMemo(() => {
    const q = term.trim().replace(/^@/, '').toLowerCase();
    return (profiles.data ?? []).filter(f =>
      !q || f.display_name.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q)
    );
  }, [profiles.data, term]);

  const toggleFriend = (friend: SafeProfile) => {
    if (creatingRef.current) return;
    setError(null);
    setSelected(current => current.includes(friend.id)
      ? current.filter(id => id !== friend.id)
      : current.length < MAX_GROUP_FRIENDS ? [...current, friend.id] : current);
  };

  const createGroup = async () => {
    if (!canCreate || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const threadId = await createGroupThread(selectedFriends.map(f => f.id), name);
      void queryClient.invalidateQueries({ queryKey: ['dm-threads', userId] });
      if (!mounted.current) return;
      router.replace({ pathname: '/thread', params: { threadId, title: name.trim() || 'Group chat' } });
    } catch (failure) {
      if (!mounted.current) return;
      const code = (failure as { code?: string })?.code;
      setError(code === '42501'
        ? 'These friends can’t share a group. Update your selection and try again.'
        : 'Couldn’t create the group. Your selection is saved—try again.');
    } finally {
      creatingRef.current = false;
      if (mounted.current) setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <Stack.Screen options={{ gestureEnabled: !creating }} />
      <View className="px-5 pb-4 flex-row items-center justify-between" style={{ paddingTop: Math.max(insets.top, 16) }}>
        <Text className="text-white text-xl font-sans-semibold">New group</Text>
        <Pressable onPress={() => router.back()} disabled={creating} accessibilityRole="button" accessibilityLabel="Cancel new group" className="min-h-11 justify-center px-2 active:opacity-60">
          <Text className="text-white/60 text-base font-sans">Cancel</Text>
        </Pressable>
      </View>

      <View className="px-5 gap-3 pb-3">
        <View className="flex-row items-center gap-3 rounded-2xl bg-white/5 px-4">
          <SymbolView name="person.2.fill" size={20} tintColor={NEON} />
          <TextInput
            value={name} onChangeText={setName} editable={!creating}
            placeholder="Group name (optional)" accessibilityLabel="Group name"
            placeholderTextColorClassName="accent-white/35" maxLength={100} autoCorrect={false}
            returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
            className="flex-1 min-h-12 py-3 text-white text-base font-sans"
          />
        </View>
        <View className="flex-row items-center gap-2 rounded-2xl border border-white/15 px-3">
          <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.45)" />
          <TextInput
            value={term} onChangeText={setTerm} editable={!creating}
            placeholder="Search friends" accessibilityLabel="Search group friends"
            placeholderTextColorClassName="accent-white/35" autoCapitalize="none" autoCorrect={false}
            returnKeyType="search" className="flex-1 min-h-12 py-3 text-white text-base font-sans"
          />
          {term ? <Pressable onPress={() => setTerm('')} disabled={creating} accessibilityRole="button" accessibilityLabel="Clear group search" className="min-w-11 min-h-11 items-center justify-center">
            <SymbolView name="xmark.circle.fill" size={18} tintColor="rgba(255,255,255,0.5)" />
          </Pressable> : null}
        </View>
      </View>

      {selectedFriends.length > 0 ? (
        <View className="pb-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {selectedFriends.map(friend => (
              <View key={friend.id} className="flex-row items-center gap-2 rounded-full bg-[#d4ff00]/10 pl-3">
                <Text onPress={creating ? undefined : friendCardPress(friend.id, userId)} accessibilityRole="button" className="text-[#d4ff00] text-sm font-sans-medium max-w-36" numberOfLines={1}>{friend.display_name.split(' ')[0]}</Text>
                <Pressable onPress={() => toggleFriend(friend)} disabled={creating} accessibilityRole="button" accessibilityLabel={`Remove ${friend.display_name} from group`} className="min-w-11 min-h-11 items-center justify-center">
                  <SymbolView name="xmark" size={12} tintColor={NEON} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Text className="px-5 pb-2 text-white/45 text-xs font-sans" accessibilityLiveRegion="polite">
        {selectedFriends.length ? `${selectedFriends.length} selected${selectedFriends.length === MAX_GROUP_FRIENDS ? ' · maximum reached' : ''}` : 'Choose at least 2 friends'}
      </Text>
      <FlatList
        className="flex-1" data={failed ? [] : matches} keyExtractor={friend => friend.id}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1 }}
        extraData={selected}
        ListEmptyComponent={loading ? <ActivityIndicator color={NEON} style={{ marginTop: 32 }} /> : (
          <View className="items-center py-8 gap-3">
            <Text className="text-white/55 text-sm font-sans text-center">{failed ? 'Couldn’t load your friends.' : term ? 'No friends match that.' : 'Add friends to start a group.'}</Text>
            {failed ? <Pressable onPress={() => { void friendship.refetch(); void profiles.refetch(); }} accessibilityRole="button" className="min-h-11 justify-center px-4"><Text className="text-[#d4ff00] font-sans-medium">Retry</Text></Pressable> : null}
          </View>
        )}
        renderItem={({ item: friend }) => {
          const checked = selected.includes(friend.id);
          const disabled = creating || (!checked && selected.length >= MAX_GROUP_FRIENDS);
          return (
            <View className="flex-row items-center gap-3 py-2.5">
              <Avatar userId={creating ? undefined : friend.id} name={friend.display_name} url={friend.avatar_url} size="md" />
              <View className="flex-1 min-w-0">
                <Text onPress={creating ? undefined : friendCardPress(friend.id, userId)} accessibilityRole="button" className="text-white text-base font-sans-medium" numberOfLines={1}>{friend.display_name}</Text>
                {friend.username ? <Text className="text-white/45 text-xs font-sans" numberOfLines={1}>@{friend.username}</Text> : null}
              </View>
              <Pressable onPress={() => toggleFriend(friend)} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={`Select ${friend.display_name}`} className="min-w-12 min-h-12 items-center justify-center active:opacity-60">
                <View className={`w-6 h-6 rounded-full border items-center justify-center ${checked ? 'bg-[#d4ff00] border-[#d4ff00]' : 'border-white/30'}`} style={{ opacity: disabled && !checked ? 0.35 : 1 }}>
                  {checked ? <SymbolView name="checkmark" size={14} tintColor="#1a0f2e" weight="bold" /> : null}
                </View>
              </Pressable>
            </View>
          );
        }}
      />
      <View className="px-5 pt-3 gap-3 border-t border-white/10" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        {error ? <Text accessibilityRole="alert" className="text-[#ffb4b4] text-sm font-sans">{error}</Text> : null}
        <Pressable onPress={createGroup} disabled={!canCreate} accessibilityRole="button" accessibilityLabel="Create group" accessibilityState={{ disabled: !canCreate, busy: creating }} className="min-h-12 rounded-full items-center justify-center py-3 px-4 active:opacity-80" style={{ backgroundColor: NEON, opacity: canCreate || creating ? 1 : 0.35 }}>
          {creating ? <ActivityIndicator color="#1a0f2e" /> : <Text className="text-[#1a0f2e] text-base font-sans-semibold">Create group</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
