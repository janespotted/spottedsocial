import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { activateWave, getPendingWave, type PendingWave } from '@/lib/launch-wave';
import { useSession } from '@/hooks/use-session';
import { LaunchButton, LaunchShell } from '@/components/launch-shell';
import { launchRpc, type LaunchDashboard } from '@/lib/launch';

export default function RolloutWaves() {
  const { launch, session } = useSession();
  const { data, error, refetch } = useQuery({ queryKey: ['launch-dashboard', session?.user.id], enabled: !!launch?.waveAdmin, queryFn: () => launchRpc<LaunchDashboard>('get_launch_dashboard') });
  const [count, setCount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<PendingWave | null>(null);
  const [recovered, setRecovered] = useState(false);
  useEffect(() => {
    if (!session?.user.id || !launch?.waveAdmin) return;
    let alive = true;
    getPendingWave(session.user.id).then(saved => { if (alive) { setRequest(saved); if (saved) setCount(String(saved.count)); setRecovered(true); } }).catch(() => Alert.alert('Pending wave unavailable', 'Could not recover a previous request. Reopen this page to retry.'));
    return () => { alive = false; };
  }, [session?.user.id, launch?.waveAdmin]);
  const lock = useRef(false);
  async function activate() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    // Keep this key on uncertain outcomes so Retry cannot activate another wave.
    try {
      await activateWave(session!.user.id, Number(count));
      setRequest(null); await refetch();
    } catch (e) { setRequest(await getPendingWave(session!.user.id).catch(() => null)); Alert.alert('Wave not confirmed', e instanceof Error ? e.message : 'Retry to check the same wave.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!launch?.waveAdmin) return <LaunchShell title="Private controls" subtitle="This page is available to rollout administrators."><LaunchButton label="Back" onPress={() => router.back()} /></LaunchShell>;
  return <LaunchShell title="The next wave." subtitle="Open a limited number of invitations from completed nominations, oldest first.">
    <View className="rounded-2xl bg-white/5 p-5 gap-3 mb-6">
      <Text className="text-white text-base">{data?.members ?? '—'} members admitted</Text>
      <Text className="text-white text-base">{data?.pending ?? '—'} nominations pending</Text>
      <Text className="text-white text-base">{data?.activated ?? '—'} activated places awaiting sign-in</Text>
    </View>
    {error ? <Pressable onPress={() => void refetch()} className="py-4"><Text className="text-red-300">Could not load the queue. Tap to retry.</Text></Pressable> : null}
    {data && !data.gated ? <Text className="text-white/70 text-base leading-6 mb-6">Controlled admission is staged but not enabled. Enable it during the coordinated release before opening a wave.</Text> : null}
    <Text className="text-white/70 mb-2">Maximum invitations in this wave</Text>
    <TextInput accessibilityLabel="Wave invitation limit" value={count} editable={!busy && !request} onChangeText={v => setCount(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} className="text-white text-3xl border-b border-white/20 py-3 mb-6" />
    <Text className="text-white/65 leading-6 mb-6">Activation lets these people claim access with their verified number. It does not send messages. Sharing and notification delivery are separate.</Text>
    <LaunchButton label={busy ? 'Opening…' : request ? 'Retry this wave' : 'Open next wave'} disabled={busy || !recovered || !data?.gated || (!data.pending && !request) || Number(count) < 1 || Number(count) > 500} onPress={() => Alert.alert('Open the next wave?', `Activate up to ${request?.count ?? Number(count)} pending invitations. Their recipients can then join Spotted. No messages will be sent.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Activate invitations', onPress: () => void activate() }])} />
    <Text className="text-white font-sans-medium mt-8 mb-3">Recent waves</Text>
    {data?.waves.map(w => <Text key={w.id} className="text-white/65 leading-6 py-2">{new Date(w.activated_at).toLocaleDateString()} · {w.invitation_count} invitations</Text>)}
    <Pressable className="py-6" onPress={() => router.back()}><Text className="text-white text-center">Done</Text></Pressable>
  </LaunchShell>;
}
