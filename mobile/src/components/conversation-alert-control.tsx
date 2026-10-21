import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/use-session';
import { conversationMuted, focusConversation, type ConversationKind } from '@/lib/conversation-notifications';
import { useDemoMode } from '@/lib/demo-mode';

export function ConversationAlertControl({ kind, id }: { kind: ConversationKind; id: string }) {
  const { session } = useSession();
  const demo = useDemoMode();
  const [muted, setMuted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const owner = session?.user.id;
  useFocusEffect(useCallback(() => owner && !demo ? focusConversation(owner, kind, id) : undefined, [owner, demo, kind, id]));
  useEffect(() => {
    let current = true;
    setMuted(null);
    if (owner && !demo) void conversationMuted(kind, id).then(value => { if (current) setMuted(value); }).catch(() => {});
    return () => { current = false; };
  }, [owner, demo, kind, id]);
  if (demo) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute this conversation' : 'Mute this conversation'} disabled={saving}
    onPress={async () => {
      if (saving) return;
      setSaving(true);
      try { setMuted(await conversationMuted(kind, id, !(muted ?? false))); }
      catch { Alert.alert('Couldn’t change alerts', 'Please try again.'); }
      finally { setSaving(false); }
    }} className="min-h-11 justify-center px-2">
    <Text className="text-[#d4ff00] text-xs font-sans-medium">{saving ? 'Saving…' : muted ? 'Unmute' : 'Mute'}</Text>
  </Pressable>;
}
