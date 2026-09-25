import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SpottedMark } from '@/components/spotted-mark';
import { NEON } from '@/lib/theme';

/**
 * The frame every onboarding tour screen shares (design: WhatsApp Sept 16).
 * Wordmark on top, a headline + supporting line, an illustration slot that
 * takes the remaining height, then the step counter and the neon Continue
 * button.
 *
 * Every screen is a still — the tour is a guided walkthrough, not a set of
 * working controls — so the frame never scrolls and holds no input.
 *
 * The mark here is the 18pt inline size, so no halo (see SpottedMark) —
 * the glow belongs to the icon and splash, not to in-app chrome.
 */
export function OnboardingScaffold({
  title,
  subtitle,
  step,
  total,
  onContinue,
  continueLabel = 'Continue',
  disabled = false,
  footnote,
  fills,
  children,
}: {
  title: string;
  /** Supporting copy under the headline. */
  subtitle?: string;
  step: number;
  total: number;
  onContinue: () => void;
  continueLabel?: string;
  disabled?: boolean;
  /** Quiet line directly above the step counter ("Update your status anytime"). */
  footnote?: string;
  /**
   * True when the illustration is itself flex-1 and should take the whole
   * slot (the map on screen 1). The default is a content-sized panel, which
   * gets balancing spacers instead.
   */
  fills?: boolean;
  children?: ReactNode;
}) {
  return (
    <View className="flex-1 px-6 pt-safe-offset-3 pb-safe-offset-4">
      <View className="flex-row items-center gap-2.5">
        <SpottedMark size={22} glow={false} />
        <Text
          className="text-white text-base font-sans-medium"
          style={{ letterSpacing: 4 }}
          maxFontSizeMultiplier={1.3}
        >
          Spotted
        </Text>
      </View>

      <View className="mt-6">
        <Text className="text-[25px] leading-7.5 font-sans-semibold text-white">{title}</Text>
        {subtitle ? (
          <Text className="text-[14px] leading-4.75 text-white/60 font-sans mt-2.5">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* A content-sized panel (screens 2–7) sits high in the space under
          the copy: the slack is split 1:2 above and below, so it neither
          hugs the subtitle nor drifts to the middle of a tall screen. The
          map card is flex-1 itself and fills the slot, so it gets no
          spacers — they would fight it for the height. */}
      <View className="flex-1 pt-7 pb-5">
        {fills ? (
          children
        ) : (
          <>
            <View className="flex-1" />
            {children}
            <View className="flex-2" />
          </>
        )}
      </View>

      {footnote ? (
        <Text className="text-[13px] text-white/45 font-sans text-center mb-1.5">{footnote}</Text>
      ) : null}

      <Text className="text-[13px] text-white/45 font-sans text-center mb-3">
        {step} of {total}
      </Text>

      <Pressable
        disabled={disabled}
        onPress={onContinue}
        accessibilityRole="button"
        className="w-full min-h-13 rounded-full items-center justify-center active:opacity-90"
        style={{ backgroundColor: NEON }}
      >
        <Text className="text-[#1a0f2e] text-base font-sans-semibold">{continueLabel}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The dark plum panel the mock UI sits on in screens 02–08.
 *
 * Content-sized, not stretched. The design was drawn on a short mockup
 * phone; stretching that content to a real screen's height only moves the
 * empty space inside the card. The scaffold centres this panel in the slot
 * instead, so the card stays the size of what it holds and the leftover
 * height is shared above and below it.
 */
export function OnboardingPanel({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-3xl border border-white/10 bg-white/4 px-5 py-6">{children}</View>
  );
}
