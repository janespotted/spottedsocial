import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { fetchProfilesSafe, type SafeProfile } from '@/lib/profiles';
import { clearTagRequest, useTagPickerRequest } from '@/lib/tag-picker';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

const MAX_ROWS = 8;

/**
 * "Tag friends" picker (addendum v3 §9.3) — friends only, multi-select,
 * searchable. A tag never widens the post's audience, so the sheet says
 * so: someone outside the audience simply won't see the post or the tag.
 */
export default function TagFriendsSheet() {
  const request = useTagPickerRequest();
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const [selected, setSelected] = useState<Set<string>>(new Set(request?.selected ?? []));
  const [term, setTerm] = useState('');

  const { data: profiles } = useQuery({
    queryKey: ['profiles-safe-all'],
    staleTime: 60_000,
    queryFn: fetchProfilesSafe,
  });

  const friends = useMemo(() => {
    const ids = new Set(friendIds ?? []);
    const q = term.trim().toLowerCase();
    return (profiles ?? [])
      .filter((p: SafeProfile) => ids.has(p.id))
      .filter(
        (p) =>
          !q ||
          p.display_name?.toLowerCase().includes(q) ||
          p.username?.toLowerCase().includes(q)
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [profiles, friendIds, term]);

  // Enough to scan without outgrowing the sheet; search finds the rest.
  const visible = friends.slice(0, MAX_ROWS);
  const hiddenCount = Math.max(0, friends.length - visible.length);

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const done = () => {
    const chosen = (profiles ?? [])
      .filter((p) => selected.has(p.id))
      .map((p) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));
    request?.onConfirm(chosen);
    clearTagRequest();
    router.back();
  };

  const cancel = () => {
    clearTagRequest();
    router.back();
  };

  return (
    <View className="pt-4 pb-safe-offset-4 gap-3">
      <View className="flex-row items-center justify-between px-5">
        <Pressable onPress={cancel} hitSlop={8}>
          <Text className="text-white/60 text-sm font-sans">Cancel</Text>
        </Pressable>
        <Text className="text-white text-base font-sans-semibold">Tag friends</Text>
        <Pressable onPress={done} hitSlop={8}>
          <Text className="text-sm font-sans-semibold" style={{ color: NEON }}>
            Done{selected.size > 0 ? ` (${selected.size})` : ''}
          </Text>
        </Pressable>
      </View>

      <View className="px-5">
        <View className="flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-3">
          <SymbolView name="magnifyingglass" size={14} tintColor="rgba(255,255,255,0.4)" />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search friends"
            placeholderTextColorClassName="accent-white/30"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 h-10 py-0 text-white text-[15px] font-sans"
          />
        </View>
      </View>

      {/* A plain View, NOT a ScrollView: under fitToContents the sheet
          measures once and a nested scroller paints over the card (the same
          trap as the venue sheet). The list is capped instead, and search
          narrows it. */}
      <View className="px-5 pb-2 gap-1">
        {!profiles ? (
          <View className="items-center py-10">
            <ActivityIndicator color={NEON} />
          </View>
        ) : friends.length === 0 ? (
          <Text className="text-white/55 text-sm font-sans text-center py-10">
            {term.trim() ? 'No friends match that.' : 'Add some friends first.'}
          </Text>
        ) : (
          visible.map((f) => {
            const isOn = selected.has(f.id);
            return (
              <Pressable
                key={f.id}
                onPress={() => toggle(f.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOn }}
                className={`flex-row items-center gap-3 p-2 rounded-xl active:bg-white/5 ${
                  isOn ? 'bg-[#d4ff00]/8' : ''
                }`}
              >
                <View
                  className="w-5 h-5 rounded-md border items-center justify-center"
                  style={{
                    borderColor: isOn ? NEON : 'rgba(255,255,255,0.3)',
                    backgroundColor: isOn ? NEON : 'transparent',
                  }}
                >
                  {isOn ? (
                    <SymbolView name="checkmark" size={11} tintColor="#000000" weight="bold" />
                  ) : null}
                </View>
                <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
                <View className="flex-1 min-w-0">
                  <Text className="text-white text-sm font-sans-medium" numberOfLines={1}>
                    {f.display_name}
                  </Text>
                  <Text className="text-white/45 text-xs font-sans" numberOfLines={1}>
                    @{f.username}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {hiddenCount > 0 ? (
        <Text className="text-white/45 text-xs font-sans px-5">
          {hiddenCount} more — search to narrow the list.
        </Text>
      ) : null}

      <Text className="text-white/45 text-xs font-sans px-5">
        Tagging doesn&apos;t change who can see your post — only the audience you picked can.
      </Text>
    </View>
  );
}
