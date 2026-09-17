import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/use-session';
import { getPushPermission, registerPushToken, type PushPermission } from '@/lib/push';
import { PURPLE } from '@/lib/theme';

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon: SFSymbol;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] active:bg-white/[0.06]"
    >
      <View className="w-9 h-9 rounded-full bg-[#a855f7]/15 items-center justify-center">
        <SymbolView name={icon} size={15} tintColor={PURPLE} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-white text-sm font-sans-medium">{title}</Text>
        {subtitle ? (
          <Text className="text-white/45 text-xs font-sans" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? (
        <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.2)" />
      ) : null)}
    </Pressable>
  );
}

/** Settings — read receipts, blocked & hidden, legal, sign out. */
export default function SettingsScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const contentContainerStyle = useResolveClassNames('px-4 py-5 gap-3');

  const { data: prefs, refetch } = useQuery({
    queryKey: ['settings-prefs', userId],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('show_read_receipts, push_enabled')
        .eq('id', userId!)
        .maybeSingle();
      return data ?? null;
    },
  });

  // Push row reflects the OS permission, not our push_enabled flag, and
  // re-reads it every time the screen is focused (the user may have just
  // come back from iOS Settings). Addendum v3 §8.6.
  const [pushPermission, setPushPermission] = useState<PushPermission | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getPushPermission().then((p) => {
        if (active) setPushPermission(p);
      });
      return () => {
        active = false;
      };
    }, [])
  );
  const onPushRow = async () => {
    if (!userId) return;
    if (pushPermission === 'undetermined') {
      setPushPermission(await registerPushToken(userId, { prompt: true }));
      return;
    }
    if (pushPermission === 'denied') {
      Alert.alert(
        'Notifications are off',
        'Turn on notifications for Spotted in iOS Settings to hear about meet ups, invites and messages.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]
      );
    }
  };
  const pushSubtitle =
    pushPermission === 'granted'
      ? 'On'
      : pushPermission === 'denied'
        ? 'Off in iOS Settings — tap to enable'
        : pushPermission === 'undetermined'
          ? 'Tap to enable'
          : ' ';

  const toggleReadReceipts = async (value: boolean) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await supabase.from('profiles').update({ show_read_receipts: value }).eq('id', userId);
    refetch();
    queryClient.invalidateQueries({ queryKey: ['dm-threads'] });
  };

  // Apple requires an in-app account-deletion path. The delete-account edge
  // function removes/anonymizes the user across all tables (web parity).
  const confirmDeleteAccount = () => {
    Alert.prompt(
      'Delete account?',
      'This permanently deletes your account and all your data — posts, messages, friends, check-ins. This cannot be undone.\n\nType DELETE to confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async (text?: string) => {
            if (text !== 'DELETE') {
              Alert.alert('Not deleted', 'You must type DELETE exactly to confirm.');
              return;
            }
            const { error } = await supabase.functions.invoke('delete-account', {
              body: { confirmation: 'DELETE' },
            });
            if (error) {
              Alert.alert('Could not delete account', 'Try again or contact support.');
              return;
            }
            await supabase.auth.signOut();
          },
        },
      ],
      'plain-text'
    );
  };

  return (
    <View className="flex-1">
      <View
        className="pt-safe-offset-3 pb-3 px-4 flex-row items-center gap-3 border-b border-white/10"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} className="active:opacity-60">
          <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <Text className="text-white font-sans-semibold text-base flex-1">Settings</Text>
      </View>

      <ScrollView contentContainerStyle={contentContainerStyle}>
        <SettingsRow
          icon="person"
          title="Account"
          subtitle={session?.user.email ?? ''}
          onPress={() => router.push('/edit-profile')}
        />
        <SettingsRow
          icon="checkmark.message"
          title="Read Receipts"
          subtitle='Show "Seen" in DMs (both sides must enable)'
          right={
            <Switch
              value={prefs?.show_read_receipts ?? false}
              onValueChange={toggleReadReceipts}
              trackColorOnClassName="accent-[#a855f7]"
            />
          }
        />
        <SettingsRow
          icon="bell"
          title="Push Notifications"
          subtitle={pushSubtitle}
          onPress={pushPermission === 'granted' ? undefined : onPushRow}
        />
        <SettingsRow
          icon="eye.slash"
          title="Blocked & Hidden"
          subtitle="Manage who can't see or reach you"
          onPress={() => router.push('/blocked-hidden')}
        />
        <SettingsRow
          icon="doc.text"
          title="Terms of Service"
          onPress={() => router.push('/terms')}
        />
        <SettingsRow
          icon="lock.shield"
          title="Privacy Policy"
          onPress={() => router.push('/privacy')}
        />

        <Pressable
          onPress={() => supabase.auth.signOut()}
          className="flex-row items-center justify-center gap-2 py-3 mt-3 rounded-full border border-red-500/40 active:bg-red-500/10"
        >
          <SymbolView name="rectangle.portrait.and.arrow.right" size={15} tintColor="#f87171" />
          <Text className="text-red-400 text-sm font-sans-medium">Log Out</Text>
        </Pressable>

        <Pressable
          onPress={confirmDeleteAccount}
          className="items-center py-3 active:opacity-70"
        >
          <Text className="text-red-400/60 text-xs font-sans">Delete Account</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
