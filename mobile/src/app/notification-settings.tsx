import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';
import { control, controlTint, INK_LIGHT, NEON } from '@/lib/theme';

type Scope = 'all' | 'close' | 'none';
interface Preferences { out_scope: Scope; moves_scope: Scope; messages_enabled: boolean; planning_enabled: boolean; recap_enabled: boolean; planning_hour: number; planning_days: number[] }
const defaults: Preferences = { out_scope: 'all', moves_scope: 'close', messages_enabled: true, planning_enabled: false, recap_enabled: false, planning_hour: 17, planning_days: [5] };
export default function NotificationSettings() {
  const { session } = useSession();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const query = useQuery({ queryKey: ['notification-preferences', session?.user.id], enabled: !!session,
    queryFn: async (): Promise<Preferences> => {
      const { data, error } = await supabase.from('notification_preferences').select('out_scope,moves_scope,messages_enabled,planning_enabled,recap_enabled,planning_hour,planning_days').eq('user_id', session!.user.id).maybeSingle();
      if (error) throw error;
      return data ? { ...data, out_scope: data.out_scope as Scope, moves_scope: data.moves_scope as Scope } : defaults;
    } });
  const save = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    if (!session || saving.current || !query.data) return;
    saving.current = true; setPending(true);
    try {
      const { error } = await supabase.from('notification_preferences').upsert({ user_id: session.user.id, ...query.data, [key]: value }, { onConflict: 'user_id' });
      if (error) throw error;
      await query.refetch();
    } catch { Alert.alert('Could not save', 'Please try again.'); }
    finally { saving.current = false; setPending(false); }
  };
  const toggle = (key: 'messages_enabled' | 'planning_enabled' | 'recap_enabled', title: string, body: string) => <View className="gap-2">
    <View className="flex-row items-center gap-4"><Text className="text-white font-sans-semibold text-lg flex-1">{title}</Text><Switch accessibilityLabel={title} value={query.data?.[key] ?? defaults[key]} disabled={pending || !query.data} onValueChange={value => void save(key, value)} trackColor={{ true: NEON }} /></View>
    <Text className="text-white/65 font-sans text-sm leading-5">{body}</Text>
  </View>;
  return <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, paddingBottom: 70, gap: 24 }}>
    <Stack.Screen options={{ title: 'Notifications', headerShown: true, headerBackButtonDisplayMode: 'minimal', headerTintColor: '#fff', headerStyle: { backgroundColor: INK_LIGHT } }} />
    <Text className="text-white/70 font-sans">Choose what you hear about. A friend’s sharing settings always apply.</Text>
    {pending ? <Text className="text-white/60">Saving…</Text> : null}
    {query.isError ? <Pressable onPress={() => query.refetch()} className="min-h-11 justify-center"><Text className="text-white">Couldn’t load preferences. Tap to retry.</Text></Pressable> : null}
    {toggle('messages_enabled', 'Messages & invitations', 'Direct messages, plan chat replies, invitations and friend requests. Day or night.')}
    <View className="gap-3"><Text className="text-white text-xl font-sans-semibold">Friend activity</Text><Text className="text-white/65 text-sm leading-5">Nighttime only, while you’re Out or TBD. Get an individual alert when each eligible friend first marks TBD or Out. Venue changes are limited to three per friend each night, at least 30 minutes apart.</Text></View>
    {(['out_scope','moves_scope'] as const).map(key => <View key={key} className="gap-2">
      <Text className="text-white text-base font-sans-medium">{key === 'out_scope' ? 'Friends going out or making plans' : 'Friends changing venues'}</Text>
      {([['all','Friends who share with me'],['close','My close friends only'],['none','Off']] as const).map(([value,label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: query.data?.[key] === value }} disabled={pending || !query.data} onPress={() => void save(key,value)} className={`rounded-2xl p-4 min-h-11 ${control[query.data?.[key] === value ? 'selected' : 'ordinary']}`}><Text className="font-sans" style={{ color: controlTint[query.data?.[key] === value ? 'selected' : 'ordinary'] }}>{label}</Text></Pressable>)}
    </View>)}
    {toggle('planning_enabled', 'Planning reminder', 'One optional reminder each weekend, skipped when you have already made plans. Uses your Spotted city’s time.')}
    {query.data?.planning_enabled ? <View className="gap-3">
      <Text className="text-white font-sans-medium">Send at</Text><View className="flex-row flex-wrap gap-2">{[12,13,14,15,16,17].map(hour => <Pressable key={hour} accessibilityRole="radio" accessibilityState={{checked: query.data?.planning_hour === hour}} disabled={pending} onPress={() => void save('planning_hour',hour)} className={`min-h-11 px-4 justify-center rounded-full ${control[query.data?.planning_hour === hour ? 'selected' : 'ordinary']}`}><Text style={{color:controlTint[query.data?.planning_hour === hour ? 'selected' : 'ordinary']}}>{hour === 12 ? 12 : hour-12} PM</Text></Pressable>)}</View>
      <Text className="text-white font-sans-medium">Choose one day</Text><View className="flex-row flex-wrap gap-2">{(['Thursday','Friday'] as const).map((day,i) => { const dayNumber=i+4; const selected=query.data!.planning_days.includes(dayNumber); return <Pressable key={day} accessibilityRole="radio" accessibilityState={{checked:selected}} disabled={pending} onPress={() => void save('planning_days',[dayNumber])} className={`min-h-11 px-4 justify-center rounded-full ${control[selected ? 'selected' : 'ordinary']}`}><Text style={{color:controlTint[selected ? 'selected' : 'ordinary']}}>{day}</Text></Pressable>; })}</View>
    </View> : null}
    {toggle('recap_enabled', 'Private replay reminder', 'At noon after a weekend night, only when a real replay is ready. At most one per weekend.')}
    <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} className="min-h-11 justify-center"><Text className="text-[#d4ff00] font-sans-medium">Open iPhone notification settings →</Text></Pressable>
  </ScrollView>;
}
