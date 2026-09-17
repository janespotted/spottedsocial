import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Contacts from 'expo-contacts';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { sendFriendRequest } from '@/lib/friends';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON, PURPLE } from '@/lib/theme';

interface ContactMatch {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  contactName: string;
}

interface Inviteable {
  name: string;
  phone: string;
}

type Step = 'intro' | 'loading' | 'results' | 'denied';

/**
 * Find friends from contacts — native form sheet. Port of the web
 * ContactsSync: US-normalized numbers matched via the match-contacts edge
 * function (numbers are hashed server-side, never stored raw).
 */
export default function ContactsSyncSheet() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [step, setStep] = useState<Step>('intro');
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [inviteable, setInviteable] = useState<Inviteable[]>([]);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  // Back from Settings with access now granted → run the match without
  // making the user tap again
  useEffect(() => {
    if (step !== 'denied') return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const { status } = await Contacts.getPermissionsAsync();
      if (status === 'granted') sync();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const sync = async () => {
    if (!userId) return;
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setStep('denied');
      return;
    }
    setStep('loading');
    try {
      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      // US-normalize to 11-digit 1XXXXXXXXXX keys (web parity)
      const phoneToName: Record<string, string> = {};
      for (const contact of contacts) {
        const name = contact.name ?? '';
        for (const phone of contact.phoneNumbers ?? []) {
          const normalized = (phone.number ?? '').replace(/[^\d]/g, '');
          if (normalized.length === 10) phoneToName[`1${normalized}`] = name;
          else if (normalized.length === 11 && normalized.startsWith('1')) {
            phoneToName[normalized] = name;
          }
        }
      }
      const uniquePhones = Object.keys(phoneToName);
      if (uniquePhones.length === 0) {
        setStep('results');
        return;
      }

      const { data, error } = await supabase.functions.invoke('match-contacts', {
        body: { phones: uniquePhones },
      });
      if (error) throw error;

      // Exclude existing friends/pending in either direction
      const existing = new Set<string>();
      const [{ data: sent }, { data: recv }] = await Promise.all([
        supabase.from('friendships').select('friend_id').eq('user_id', userId),
        supabase.from('friendships').select('user_id').eq('friend_id', userId),
      ]);
      for (const f of sent ?? []) existing.add(f.friend_id);
      for (const f of recv ?? []) existing.add(f.user_id);

      setMatches(
        ((data?.matches ?? []) as Array<Record<string, any>>)
          .map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name,
            avatar_url: m.avatar_url ?? null,
            contactName: phoneToName[m.phone] || m.display_name,
          }))
          .filter((m) => !existing.has(m.user_id))
      );
      setInviteable(
        ((data?.nonMatches ?? []) as string[])
          .filter((phone) => phoneToName[phone])
          .map((phone) => ({ name: phoneToName[phone], phone }))
          .slice(0, 20)
      );
      setStep('results');
    } catch {
      setStep('results');
    }
  };

  const addFriend = async (match: ContactMatch) => {
    if (!userId || requested.has(match.user_id)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRequested((prev) => new Set(prev).add(match.user_id));
    await sendFriendRequest(userId, match.user_id);
  };

  const inviteBySms = (person: Inviteable) => {
    const body = encodeURIComponent(
      'Join me on Spotted to see where friends are going out tonight 🎉 https://spottedsocial.vercel.app'
    );
    Linking.openURL(`sms:${person.phone}&body=${body}`);
  };

  return (
    <View className="pt-6 pb-10 px-5" style={{ maxHeight: 620 }}>
      <Text className="text-white text-lg font-sans-semibold mb-1">Find Friends from Contacts</Text>

      {step === 'intro' ? (
        <View className="gap-4 pt-3">
          <Text className="text-white/60 text-sm font-sans leading-5">
            See which of your contacts are already on Spotted. Phone numbers are matched securely
            and never stored.
          </Text>
          <Pressable
            onPress={sync}
            className="rounded-full py-3.5 items-center active:opacity-90"
            style={{ backgroundColor: NEON }}
          >
            <Text className="text-[#1a0f2e] text-base font-sans-semibold">Sync Contacts</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'loading' ? (
        <View className="items-center py-14 gap-3">
          <ActivityIndicator color={NEON} size="large" />
          <Text className="text-white/50 text-sm font-sans">Matching your contacts...</Text>
        </View>
      ) : null}

      {step === 'denied' ? (
        // Declining contacts must not be a dead end (client feedback §8):
        // the other two ways to find friends sit right here, and coming
        // back from Settings with access granted re-runs the match.
        <View className="items-center py-8 gap-4">
          <SymbolView name="person.crop.circle.badge.xmark" size={34} tintColor="rgba(168,85,247,0.6)" />
          <Text className="text-white text-base font-sans-semibold text-center">Contacts access is off</Text>
          <Text className="text-white/55 text-sm font-sans text-center leading-5">
            Turn it on in Settings to match your contacts, or find friends another way.
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            className="rounded-full px-6 min-h-11 justify-center active:opacity-90"
            style={{ backgroundColor: NEON }}
          >
            <Text className="text-[#1a0f2e] font-sans-semibold">Open Settings</Text>
          </Pressable>
          <View className="flex-row gap-2 w-full pt-1">
            <Pressable
              onPress={() => {
                router.back();
                setTimeout(() => router.push('/search'), 300);
              }}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 min-h-11 rounded-full border border-white/20 active:bg-white/5"
            >
              <SymbolView name="magnifyingglass" size={14} tintColor="#ffffff" />
              <Text className="text-white text-sm font-sans-semibold">Search people</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                router.back();
                setTimeout(() => router.push('/invite-friends'), 300);
              }}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 min-h-11 rounded-full border border-white/20 active:bg-white/5"
            >
              <SymbolView name="paperplane" size={14} tintColor="#ffffff" />
              <Text className="text-white text-sm font-sans-semibold">Invite friends</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 'results' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider pt-3 pb-2">
            On Spotted ({matches.length})
          </Text>
          {matches.length === 0 ? (
            <Text className="text-white/55 text-sm font-sans">No contacts on Spotted yet.</Text>
          ) : (
            matches.map((match) => (
              <View key={match.user_id} className="flex-row items-center gap-3 py-2.5">
                <Avatar name={match.display_name} url={match.avatar_url} size="md" />
                <View className="flex-1 min-w-0">
                  <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                    {match.display_name}
                  </Text>
                  <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
                    {match.contactName} in your contacts
                  </Text>
                </View>
                <Pressable
                  onPress={() => addFriend(match)}
                  disabled={requested.has(match.user_id)}
                  className="px-4 py-2 rounded-full active:opacity-90"
                  style={{
                    backgroundColor: requested.has(match.user_id)
                      ? 'rgba(212,255,0,0.25)'
                      : NEON,
                  }}
                >
                  <Text className="text-[#1a0f2e] text-xs font-sans-semibold">
                    {requested.has(match.user_id) ? 'Requested' : 'Add'}
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          {inviteable.length > 0 ? (
            <>
              <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider pt-5 pb-2">
                Invite to Spotted
              </Text>
              {inviteable.map((person) => (
                <View key={person.phone} className="flex-row items-center gap-3 py-2.5">
                  <View className="w-10 h-10 rounded-full bg-[#2d1b4e] items-center justify-center">
                    <SymbolView name="person" size={16} tintColor={PURPLE} />
                  </View>
                  <Text className="text-white text-base font-sans-medium flex-1" numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Pressable
                    onPress={() => inviteBySms(person)}
                    className="px-4 py-2 rounded-full border border-[#a855f7]/40 active:bg-[#a855f7]/15"
                  >
                    <Text className="text-[#a855f7] text-xs font-sans-semibold">Invite</Text>
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}
