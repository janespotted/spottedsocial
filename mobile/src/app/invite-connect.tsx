import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useSession } from '@/hooks/use-session';
import { useDemoMode } from '@/lib/demo-mode';
import { connectInvitation } from '@/lib/invitation-connection';
import { normalizeInvitationCode } from '@/lib/invitation-links';
import { Avatar } from '@/components/avatar';
import { INK_LIGHT, NEON } from '@/lib/theme';

export default function InviteConnect() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { session } = useSession();
  const demo = useDemoMode();
  const client = useQueryClient();
  const [draft, setDraft] = useState(params.code ?? '');
  const [code, setCode] = useState(normalizeInvitationCode(params.code ?? ''));
  const [sending, setSending] = useState(false);
  const query = useQuery({ queryKey: ['invitation-connection', session?.user.id, code], enabled: !!session && !!code && !demo,
    staleTime: 0, retry: false, queryFn: () => connectInvitation(code!) });
  const person = query.data;
  const request = async () => {
    if (!code || sending) return;
    setSending(true);
    try {
      const next = await connectInvitation(code, true);
      client.setQueryData(['invitation-connection', session?.user.id, code], next);
      void client.invalidateQueries({ queryKey: ['friends'] });
      void client.invalidateQueries({ queryKey: ['friend-ids'] });
    } catch (error) { Alert.alert('Couldn’t send request', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSending(false); }
  };
  return <ScrollView className="flex-1 bg-background" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 22 }}>
    <Stack.Screen options={{ headerShown: true, title: 'Find your friend', headerBackButtonDisplayMode: 'minimal', headerTintColor: '#fff', headerStyle: { backgroundColor: INK_LIGHT } }} />
    <Text className="text-white/70 leading-6">Open the link your friend shared, or enter its eight-character code.</Text>
    <View className="gap-3">
      <TextInput accessibilityLabel="Invitation code" value={draft} onChangeText={setDraft} autoCapitalize="characters" autoCorrect={false} maxLength={8}
        placeholder="ABCDEFGH" placeholderTextColor="#776d85" className="rounded-2xl border border-white/20 p-4 text-white text-xl font-sans" />
      <Pressable accessibilityRole="button" disabled={!normalizeInvitationCode(draft) || demo} onPress={() => { setCode(normalizeInvitationCode(draft)); if (code === normalizeInvitationCode(draft)) void query.refetch(); }} className="min-h-12 justify-center">
        <Text style={{ color: normalizeInvitationCode(draft) && !demo ? NEON : '#776d85' }}>Find friend</Text>
      </Pressable>
    </View>
    {demo ? <Text className="text-white/70">Exit Demo to connect with a real friend.</Text> : null}
    {query.isFetching ? <ActivityIndicator color={NEON} /> : query.isError ? <View className="gap-3">
      <Text className="text-white/70">This invitation couldn’t be opened. Check the code or ask your friend for a new link.</Text>
      <Pressable accessibilityRole="button" onPress={() => void query.refetch()} className="min-h-11 justify-center"><Text style={{ color: NEON }}>Try again</Text></Pressable>
    </View> : person ? <View className="gap-4 rounded-3xl border border-white/15 p-5">
      <Avatar name={person.display_name} url={person.avatar_url} size="lg" />
      <Text className="text-white text-2xl font-sans-semibold">{person.display_name}</Text>
      <Text className="text-white/65">@{person.username}</Text>
      <Text className="text-white/70 leading-6">{person.state === 'friends' ? 'You’re already friends on Spotted.' : person.state === 'requested' ? 'Friend request sent. They can accept it on Spotted.' : person.state === 'incoming' ? 'They’ve already sent you a friend request.' : 'Send a friend request to start planning together.'}</Text>
      {person.state === 'available' ? <Pressable accessibilityRole="button" disabled={sending} onPress={() => void request()} className="rounded-full min-h-12 items-center justify-center px-5" style={{ backgroundColor: NEON }}><Text className="text-[#211037] font-sans-semibold">{sending ? 'Sending…' : 'Send friend request'}</Text></Pressable> :
        <Pressable accessibilityRole="button" onPress={() => router.replace('/friends')} className="min-h-12 justify-center"><Text style={{ color: NEON }}>{person.state === 'incoming' ? 'View friend requests' : 'Go to friends'}</Text></Pressable>}
      <Text className="text-white/45 text-xs leading-5">Connecting never changes either person’s location-sharing settings.</Text>
    </View> : null}
  </ScrollView>;
}
