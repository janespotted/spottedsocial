import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { NEON, control, outlineControl, primaryControl, primaryControlText } from '@/lib/theme';

export interface EmptyAction {
  label: string;
  onPress: () => void;
  icon?: SFSymbol;
  /** Neon fill; at most one per state. */
  primary?: boolean;
}

/**
 * One empty state for every list (client feedback §8): an icon, a title
 * that names the situation, a line that says why, and the action that
 * fixes it. Never used for loading or errors — those have their own.
 */
export function EmptyState({
  icon,
  title,
  body,
  actions = [],
  tone = 'neutral',
  compact = false,
}: {
  icon: SFSymbol;
  title: string;
  body?: string;
  actions?: EmptyAction[];
  /** `positive` tints the icon neon — the user has done their part. */
  tone?: 'neutral' | 'positive';
  compact?: boolean;
}) {
  return (
    <View className={`items-center px-8 ${compact ? 'py-8' : 'py-14'}`}>
      <View
        className={`rounded-full items-center justify-center mb-5 ${compact ? 'w-14 h-14' : 'w-20 h-20'}`}
        style={{ backgroundColor: tone === 'positive' ? 'rgba(212,255,0,0.10)' : 'rgba(45,27,78,0.6)' }}
      >
        <SymbolView
          name={icon}
          size={compact ? 24 : 36}
          tintColor={tone === 'positive' ? NEON : 'rgba(168,85,247,0.7)'}
        />
      </View>
      <Text className="text-xl font-sans-semibold text-white text-center mb-2">{title}</Text>
      {body ? (
        <Text className="text-white/55 text-sm font-sans text-center leading-5 max-w-72">{body}</Text>
      ) : null}
      {actions.length > 0 ? (
        <View className="flex-row flex-wrap justify-center gap-2.5 mt-6">
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              className={`flex-row items-center gap-2 min-h-11 pl-4 pr-5 rounded-full active:opacity-90 ${
                a.primary ? primaryControl : outlineControl
              }`}
            >
              {a.icon ? (
                <SymbolView name={a.icon} size={15} tintColor={a.primary ? '#1a0f2e' : '#ffffff'} weight="semibold" />
              ) : null}
              <Text className={`text-sm font-sans-semibold ${a.primary ? primaryControlText : 'text-white'}`}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A failed load is never an empty feed: say so, offer Retry. */
export function ErrorState({
  title = "Couldn't load this",
  body = 'Check your connection and try again.',
  onRetry,
  retrying = false,
}: {
  title?: string;
  body?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <View className="items-center px-8 py-14">
      <View className="w-16 h-16 rounded-full items-center justify-center mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <SymbolView name="wifi.exclamationmark" size={28} tintColor="rgba(255,255,255,0.5)" />
      </View>
      <Text className="text-lg font-sans-semibold text-white text-center mb-1.5">{title}</Text>
      <Text className="text-white/55 text-sm font-sans text-center leading-5 max-w-72">{body}</Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        className={`mt-6 min-h-11 px-6 rounded-full items-center justify-center active:opacity-90 disabled:opacity-50 ${primaryControl}`}
      >
        {retrying ? (
          <ActivityIndicator size="small" color="#1a0f2e" />
        ) : (
          <Text className={`text-sm font-sans-semibold ${primaryControlText}`}>Retry</Text>
        )}
      </Pressable>
    </View>
  );
}

/** Compact inline row: "Find friends · Invite" for screens that have content. */
export function AddFriendsRow() {
  return (
    <View className="flex-row gap-2">
      <Pressable
        onPress={() => router.push('/contacts-sync')}
        accessibilityRole="button"
        className={`flex-1 flex-row items-center justify-center gap-2 min-h-11 rounded-full ${control.ordinary} active:opacity-70`}
      >
        <SymbolView name="person.badge.plus" size={15} tintColor="#ffffff" />
        <Text className="text-white text-sm font-sans-semibold">Find friends</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/invite-friends')}
        accessibilityRole="button"
        className={`flex-1 flex-row items-center justify-center gap-2 min-h-11 rounded-full ${control.ordinary} active:opacity-70`}
      >
        <SymbolView name="paperplane" size={15} tintColor="#ffffff" />
        <Text className="text-white text-sm font-sans-semibold">Invite</Text>
      </Pressable>
    </View>
  );
}
