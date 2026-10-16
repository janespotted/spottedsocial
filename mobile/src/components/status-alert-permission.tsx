import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getPushPermission, registerPushToken } from '@/lib/push';
import { useSession } from '@/hooks/use-session';

/** A contextual invitation after the user has shared tonight's status. */
export function StatusAlertPermission() {
  const { session } = useSession();
  const [needed, setNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; void getPushPermission().then(p => { if (active) setNeeded(p === 'undetermined'); }).catch(() => {}); return () => { active = false; }; }, []);
  if (!needed) return null;
  const enable = async () => {
    if (!session || busy) return;
    setBusy(true); setError(false);
    try { await registerPushToken(session.user.id, { prompt: true }); setNeeded(false); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  return <View className="self-stretch rounded-xl px-4 py-3 bg-white/5 gap-1">
    <Text className="text-white text-sm font-sans-medium">Know when friends are out.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} className="min-h-11 justify-center"><Text className="text-[#d4ff00] text-sm">{busy ? 'Connecting…' : error ? 'Try enabling alerts again' : 'Enable alerts'}</Text></Pressable>
  </View>;
}
