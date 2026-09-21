import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import { ReanimatedTrueSheet } from '@lodev09/react-native-true-sheet/reanimated';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/avatar';
import { CommentRow } from '@/components/comment-row';
import { ExpiredState } from '@/components/empty-state';
import { usePostComments, type PostComment } from '@/hooks/use-post-comments';
import { dismissKeyboardNow } from '@/hooks/use-dismiss-keyboard-on-leave';
import { supabase } from '@/lib/supabase';
import { INK_LIGHT, NEON } from '@/lib/theme';

const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

export interface CommentSheetHandle {
  /** `focus`: put the caret in the composer once the sheet is up (the reel's "Add comment…" bar). */
  open: (opts?: { focus?: boolean }) => void;
  /** Resolves once the native sheet is gone; a no-op when it is not up. */
  dismiss: () => Promise<void>;
}

interface CommentSheetProps {
  postId: string;
  /** First name goes in the placeholder: "Add a comment for Nadeem…" */
  authorName: string;
  /**
   * `reel`: presented over the reel on demand, background not dimmed so the
   * media above stays visible and tappable. `sheet`: presented on mount over
   * the feed, dimmed; tapping the dim dismisses.
   */
  mode: 'reel' | 'sheet';
  /** The sheet has gone (swipe down, dim tap, or dismiss()). */
  onDismissed?: () => void;
  onExpired: () => void;
}

/**
 * The Instagram-style comment sheet as a NATIVE sheet
 * (UISheetPresentationController via True Sheet). Native detents, grabber
 * and drag physics; keyboard avoidance is native too — the footer composer
 * rises above the keyboard. Wrapped in ReanimatedTrueSheet so the sheet's
 * top edge is available to the detail screen as a shared value on the UI
 * thread (POST-DETAIL-PLAN.md §3.4).
 */
export const CommentSheet = forwardRef<CommentSheetHandle, CommentSheetProps>(function CommentSheet(
  { postId, authorName, mode, onDismissed, onExpired },
  ref
) {
  const sheet = useRef<TrueSheet>(null);
  const presented = useRef(false);
  const input = useRef<TextInput>(null);
  // autoFocus inside a native sheet raises the keyboard before the sheet
  // has finished presenting (True Sheet's documented trap); focus is
  // deferred to onDidPresent instead.
  const focusOnPresent = useRef(false);
  const insets = useSafeAreaInsets();
  const c = usePostComments(postId);
  const [composerFocused, setComposerFocused] = useState(false);

  // The viewer's own avatar beside the composer, as Instagram does.
  const { data: me } = useQuery({
    queryKey: ['profile-avatar', c.currentUserId],
    enabled: !!c.currentUserId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (
        await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', c.currentUserId!)
          .maybeSingle()
      ).data,
  });

  useImperativeHandle(ref, () => ({
    open: (opts) => {
      focusOnPresent.current = !!opts?.focus;
      if (presented.current) {
        if (opts?.focus) input.current?.focus();
        return;
      }
      void sheet.current?.present(0);
    },
    dismiss: async () => {
      if (!presented.current) return;
      dismissKeyboardNow();
      await sheet.current?.dismiss();
    },
  }));

  const firstName = authorName.split(' ')[0] || authorName;

  const submit = async (raw?: string) => {
    const ok = await c.send(raw);
    if (ok) dismissKeyboardNow(); // a sent comment ends the input (addendum v3 §8.2)
  };

  const expired = c.postExists === false;

  const composer = (
    <View
      className="border-t border-white/10"
      style={{ backgroundColor: INK_LIGHT, paddingBottom: insets.bottom }}
    >
      {/* Quick-emoji react row (posts the emoji as a comment, like web) */}
      <View className="flex-row items-center justify-around px-4 py-2.5">
        {QUICK_EMOJIS.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => void submit(emoji)}
            hitSlop={6}
            className="active:scale-125"
          >
            <Text className="text-2xl">{emoji}</Text>
          </Pressable>
        ))}
      </View>
      {c.error ? (
        <Text selectable className="text-xs text-red-400 font-sans px-4 pt-1">
          {c.error}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-3 px-4 pt-1 pb-2">
        <Avatar name={me?.display_name ?? ''} url={me?.avatar_url ?? null} size="md" />
        <View
          className="flex-1 flex-row items-center rounded-full bg-white/5 pl-4 pr-1.5 py-1"
          style={{
            borderWidth: 1,
            borderColor: composerFocused ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
          }}
        >
          <TextInput
            ref={input}
            value={c.draft}
            onChangeText={c.setDraft}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            placeholder={`Add a comment for ${firstName}…`}
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
            maxLength={500}
            style={{
              flex: 1,
              minHeight: 36,
              maxHeight: 96,
              paddingVertical: 8,
              color: '#fff',
              fontSize: 15,
              fontFamily: 'Montserrat_400Regular',
            }}
          />
          <Pressable
            onPress={() => void submit()}
            disabled={!c.draft.trim() || c.sending}
            hitSlop={8}
            accessibilityLabel="Send comment"
            className="w-8 h-8 rounded-full items-center justify-center disabled:opacity-30"
            style={{ backgroundColor: NEON }}
          >
            {c.sending ? (
              <ActivityIndicator size="small" color="#1a0f2e" />
            ) : (
              <SymbolView name="arrow.up" size={16} tintColor="#1a0f2e" weight="semibold" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <ReanimatedTrueSheet
      ref={sheet}
      detents={[0.55, 0.9]}
      initialDetentIndex={mode === 'sheet' ? 0 : -1}
      dimmed={mode === 'sheet'}
      scrollable
      scrollableOptions={{ scrollingExpandsSheet: false }}
      grabber
      cornerRadius={20}
      backgroundColor={INK_LIGHT}
      header={
        <Text className="text-white text-base font-sans-semibold text-center pt-3 pb-2">
          Comments
        </Text>
      }
      footer={expired ? undefined : composer}
      footerOptions={{ keyboardOffset: -insets.bottom }}
      onDidPresent={() => {
        presented.current = true;
        if (focusOnPresent.current) {
          focusOnPresent.current = false;
          input.current?.focus();
        }
      }}
      onDidDismiss={() => {
        presented.current = false;
        dismissKeyboardNow();
        onDismissed?.();
      }}
    >
      {c.isLoading || c.checkingPost ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator color={NEON} />
        </View>
      ) : expired ? (
        <ExpiredState what="This post" onDismiss={onExpired} dismissLabel="Close" />
      ) : (
        <FlatList<PostComment>
          data={c.comments}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={dismissKeyboardNow}
          contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 24 }}
          ListEmptyComponent={
            <Text className="text-white/55 text-sm font-sans text-center py-12">
              No comments yet — say something first.
            </Text>
          }
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              currentUserId={c.currentUserId}
              onToggleLike={c.toggleCommentLike}
            />
          )}
        />
      )}
    </ReanimatedTrueSheet>
  );
});
