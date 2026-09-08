import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/use-session';

const PURPLE = '#a855f7';

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
          <Text className="text-white/30 text-xs font-sans" numberOfLines={1}>
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

  const toggleReadReceipts = async (value: boolean) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await supabase.from('profiles').update({ show_read_receipts: value }).eq('id', userId);
    refetch();
    queryClient.invalidateQueries({ queryKey: ['dm-threads'] });
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
          subtitle={prefs?.push_enabled ? 'Enabled' : 'Enable when going live'}
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
      </ScrollView>
    </View>
  );
}
