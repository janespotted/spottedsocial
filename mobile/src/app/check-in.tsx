import { morningAfterAt } from '@/lib/tonight';
import { useNightMode } from '@/hooks/use-night-mode';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type LayoutAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Check,
  CirclePlus,
  House,
  MapPin,
  Navigation,
  Search,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { CITY_NEIGHBORHOODS } from '@/lib/city-neighborhoods';
import {
  captureLocationWithVenue,
  GPS_ACCURACY_THRESHOLD_DEMO,
  neighborhoodFromCoords,
  type LocationData,
} from '@/lib/location-service';
import { goOutAtVenue, goPlanning, stayIn } from '@/lib/night-status';
import {
  enableAutomaticUpdates,
  getCurrentPosition,
  startBackgroundLocation,
  type TrackingResult,
} from '@/lib/background-location';
import { getLocationPermission, hasLocationAccess, requestAutomaticUpdates } from '@/lib/location-ready';
import { markNightAnswered } from '@/lib/night-gate';
import { DEFAULT_AUDIENCE, isAudience, type Audience } from '@/lib/audience';
import { useSession } from '@/hooks/use-session';
import { RESET_BODY, RESET_COPY, RESET_TITLE, resetTimeWithCity } from '@/lib/reset-copy';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { invalidateNightStatusQueries, useOwnNightStatus } from '@/hooks/use-own-night-status';
import type { OwnNightStatus } from '@/lib/night-status';
import { AudienceRow } from '@/components/audience-row';
import { fireConfetti } from '@/lib/confetti';
import { INK_LIGHT, NEON, primaryControl, primaryControlText } from '@/lib/theme';
import { SymbolView } from 'expo-symbols';

/** Which part of the sheet is showing. The answer itself is `answer`. */
type View_ = 'main' | 'spot' | 'party' | 'done';
type Answer = 'yes' | 'tbd' | 'no';

/**
 * Where "I'm out" stands on suggesting a spot. Nothing here ever writes —
 * location only lets Spotted guess the venue; "Check in" is the write.
 */
type LocState = 'idle' | 'checking' | 'needs-permission' | 'denied' | 'detecting' | 'ready' | 'failed';

/** A venue (id) or a free-text spot the user typed (id null). */
interface Spot {
  id: string | null;
  name: string;
}

const SEGMENTS: Array<{ key: Answer; label: string }> = [
  { key: 'yes', label: 'I’m out' },
  { key: 'tbd', label: 'TBD' },
  { key: 'no', label: 'Staying in' },
];

/** Find your spot scrolls, so it can show every nearby venue the GPS lookup returns. */
const MAX_SPOT_ROWS = 12;

/** Which screen is deeper, so moving between them can push or pop. */
const VIEW_DEPTH: Record<View_, number> = { main: 0, spot: 1, party: 2, done: 3 };

/* ────────────────────────── Motion ────────────────────────── */

/**
 * Every height change in this sheet resizes the native sheet, and UIKit
 * animates that itself (react-native-screens applies fitToContents changes
 * inside `animateChanges`). Content is pinned to the sheet's TOP, so a view
 * below a change would jump by the difference and then ride the sheet back.
 * SHEET_LAYOUT moves those views on a critically damped spring of roughly
 * UIKit's length, so the button holds (nearly) still while the sheet grows
 * or shrinks. Tune it against a device recording, not by eye in the code.
 */
const SHEET_LAYOUT = LinearTransition.springify(420).dampingRatio(1);

/** The selection pill: quick, and settles without a visible bounce. */
const PILL_SPRING = { duration: 380, dampingRatio: 0.9 } as const;

const CONTENT_SPRING = { duration: 420, dampingRatio: 1 } as const;

/** Content swapped in place (I'm out ⇄ TBD ⇄ Staying in): a short nudge. */
const NUDGE = 24;
/** A new screen inside the sheet (Find your spot, Private party): a longer push. */
const PUSH = 48;

/** Fade in while sliding in from one side (+1 = from the right). */
function slideIn(from: 1 | -1, distance: number) {
  return (): LayoutAnimation => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateX: from * distance }] },
      animations: {
        opacity: withTiming(1, { duration: 220 }),
        transform: [{ translateX: withSpring(0, CONTENT_SPRING) }],
      },
    };
  };
}

const NUDGE_FROM_RIGHT = slideIn(1, NUDGE);
const NUDGE_FROM_LEFT = slideIn(-1, NUDGE);
const PUSH_IN = slideIn(1, PUSH);
const POP_IN = slideIn(-1, PUSH);
/**
 * Outgoing content only fades. Its `exiting` was fixed at its last render,
 * before anyone knew which way the next screen would come from.
 */
const FADE_AWAY = FadeOut.duration(140);

/**
 * UIKit's large detent starts this far below the status bar. "Find your
 * spot" asks for that much height so the fitToContents sheet grows to full.
 */
const LARGE_DETENT_TOP_GAP = 10;

interface Payoff {
  kind: 'out' | 'planning';
  venueName: string | null;
  /** Private party: automatic updates are never offered (exact spot is close-friends-only). */
  isParty: boolean;
  out: number;
  planning: number;
}

/** State of the separate "automatic updates" step shown on the payoff screen. */
interface AutoUpdates extends TrackingResult {
  /** The user has tapped "Turn on" at least once this session. */
  asked: boolean;
}

/** Schedule the 10am morning-after recap (web scheduleMorningAfterNotification). */
async function scheduleMorningAfter(city: string, userId: string): Promise<void> {
  try {
    const next = morningAfterAt(new Date(), city);
    await Notifications.cancelScheduledNotificationAsync('morning-after-recap');
    await Notifications.scheduleNotificationAsync({
      identifier: 'morning-after-recap', // same id → replaces prior schedule
      content: {
        title: 'Last night on Spotted ☀️',
        body: 'Replay the night — your stops, pictures and familiar faces.',
        data: { type: 'morning_after', url: '/morning-after', receiver_id: userId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next },
    });
  } catch {
    /* notifications denied — skip */
  }
}

/** Friends out / deciding right now — the immediate payoff after sharing. */
async function fetchFriendCounts(friendIds: string[]): Promise<{ out: number; planning: number }> {
  if (friendIds.length === 0) return { out: 0, planning: 0 };
  const { data } = await supabase
    .from('night_statuses')
    .select('status')
    .in('user_id', friendIds)
    .in('status', ['out', 'planning'])
    .gt('expires_at', new Date().toISOString());
  let out = 0;
  let planning = 0;
  for (const row of data ?? []) {
    if (row.status === 'out') out += 1;
    else planning += 1;
  }
  return { out, planning };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Never leave the user on a spinner: reject with a 'timeout' error after `ms`. */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

// One GPS attempt (the SDK samples for up to 15s) plus the venue lookup
const GPS_ATTEMPT_TIMEOUT_MS = 20_000;
// Reading permission state should be instant; a hang means the plugin is broken
const PERMISSION_CHECK_TIMEOUT_MS = 8_000;
const isAre = (n: number) => (n === 1 ? 'is' : 'are');

/** Tonight's saved answer, as the segment it corresponds to. */
function answerFromStatus(status: OwnNightStatus | null | undefined): Answer | null {
  switch (status?.status) {
    case 'out':
    case 'off':
      return 'yes';
    case 'planning':
      return 'tbd';
    case 'home':
      return 'no';
    default:
      return null;
  }
}

/* ────────────────────────── UI pieces ────────────────────────── */

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className="rounded-full min-h-14 py-4 items-center justify-center active:opacity-90 disabled:opacity-30"
      style={{ backgroundColor: NEON, boxShadow: '0 0 16px rgba(212,255,0,0.25)' }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={INK_LIGHT} />
      ) : (
        // Keyed by label so "Check in" → "Set as TBD" fades instead of snapping.
        <Animated.Text
          key={label}
          entering={FadeIn.duration(180)}
          className="text-[#1a0f2e] text-[17px] font-sans-semibold"
        >
          {label}
        </Animated.Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full min-h-12 py-3 items-center justify-center border border-white/15 active:bg-white/5"
    >
      <Text className="text-white text-sm font-sans-medium">{label}</Text>
    </Pressable>
  );
}

/** Lime underlined text action ("Change", "Add an area · optional"). */
function LinkAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" className="active:opacity-70">
      <Text className="text-[#d4ff00] text-sm font-sans-medium underline">{label}</Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-white/55 text-xs font-sans-medium uppercase tracking-widest">
      {children}
    </Text>
  );
}

/** Soft card holding the supporting copy for TBD / Staying in. */
function InfoCard({ lines }: { lines: string[] }) {
  return (
    <View className="rounded-2xl bg-white/6 px-4 py-4 gap-1.5">
      {lines.map((line) => (
        <Text key={line} className="text-white/70 text-[15px] font-sans">
          {line}
        </Text>
      ))}
    </View>
  );
}

/** The 5 AM line above the primary button; tap for the full explanation. */
function ResetNote({ text, city }: { text: string; city: string }) {
  return (
    <Pressable
      onPress={() => Alert.alert(RESET_TITLE, `${RESET_BODY}\n\n${resetTimeWithCity(city)}.`)}
      accessibilityRole="button"
      accessibilityHint="Explains what resets at 5 AM"
      className="active:opacity-70"
    >
      <Text className="text-white/55 text-[13px] font-sans text-center">{text}</Text>
    </Pressable>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="flex-row items-center gap-1.5 self-start active:opacity-70"
    >
      <ArrowLeft size={16} color="rgba(255,255,255,0.6)" />
      <Text className="text-white/60 text-sm font-sans">Back</Text>
    </Pressable>
  );
}

/**
 * I'm out / TBD / Staying in. The selection is one neon pill that slides
 * on the UI thread. Each label exists twice, white on the track and ink
 * inside the pill; the ink row counter-slides so it stays aligned with the
 * track, and the pill clips it, so a label changes colour exactly where the
 * pill's edge crosses it. Both rows use the same weight so the two copies of
 * a word line up mid-slide.
 */
function Segments({
  value,
  onChange,
  disabled,
}: {
  value: Answer;
  onChange: (a: Answer) => void;
  disabled?: boolean;
}) {
  const index = SEGMENTS.findIndex((s) => s.key === value);
  const [trackWidth, setTrackWidth] = useState(0);
  const segmentWidth = trackWidth / SEGMENTS.length;
  const position = useSharedValue(index);
  const tapped = useRef(false);

  useEffect(() => {
    // A tap slides the pill. A value that changes on its own (tonight's
    // answer arriving after the sheet opened) just lands there.
    position.value = tapped.current ? withSpring(index, PILL_SPRING) : index;
    tapped.current = false;
  }, [index, position]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * segmentWidth }],
  }));
  const inkStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -position.value * segmentWidth }],
  }));

  return (
    <View accessibilityRole="radiogroup" className="rounded-2xl bg-black/25 p-1.5">
      <View className="flex-row" onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        {SEGMENTS.map((s, i) => {
          const selected = i === index;
          return (
            <Pressable
              key={s.key}
              onPress={() => {
                if (selected) return;
                tapped.current = true;
                Haptics.selectionAsync();
                onChange(s.key);
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={s.label}
              className="flex-1 min-h-12 items-center justify-center px-1 active:opacity-70"
            >
              <Text numberOfLines={1} className="text-white text-[15px] font-sans-medium">
                {s.label}
              </Text>
            </Pressable>
          );
        })}

        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: segmentWidth,
                borderRadius: 12,
                borderCurve: 'continuous',
                overflow: 'hidden',
                backgroundColor: NEON,
              },
              pillStyle,
            ]}
          >
            <Animated.View style={[{ flexDirection: 'row', width: trackWidth, height: '100%' }, inkStyle]}>
              {SEGMENTS.map((s) => (
                <View key={s.key} style={{ width: segmentWidth }} className="items-center justify-center px-1">
                  <Text numberOfLines={1} className="text-[#1a0f2e] text-[15px] font-sans-medium">
                    {s.label}
                  </Text>
                </View>
              ))}
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

/** One row of the "Find your spot" list. */
function SpotRow({
  name,
  subtitle,
  icon: Icon = MapPin,
  selected,
  onPress,
}: {
  name: string;
  subtitle?: string;
  icon?: LucideIcon;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-3 min-h-14 py-3 border-b border-white/10 active:opacity-70"
    >
      <Icon size={18} color="rgba(255,255,255,0.75)" />
      <View className="flex-1">
        <Text className="text-white text-[15px] font-sans-medium" numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? <Text className="text-white/55 text-xs font-sans mt-0.5">{subtitle}</Text> : null}
      </View>
      {selected ? <Check size={17} color={NEON} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

/**
 * Neighborhood chips. Wraps and never scrolls: the sheet is fitToContents,
 * where a nested scroller breaks the content measurement.
 */
function AreaChips({
  city,
  value,
  onChange,
  allowNone,
}: {
  city: string;
  value: string | null;
  onChange: (hood: string | null) => void;
  allowNone?: boolean;
}) {
  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`px-3 py-2 rounded-xl border ${
        selected ? 'bg-[#a855f7]/25 border-[#a855f7]/40' : 'bg-white/6 border-transparent'
      }`}
    >
      <Text className={`text-xs font-sans ${selected ? 'text-[#d4ff00]' : 'text-white/70'}`}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View className="flex-row flex-wrap gap-2">
      {allowNone ? chip('No area', value === null, () => onChange(null)) : null}
      {(CITY_NEIGHBORHOODS[city] ?? []).map((hood) =>
        chip(hood, value === hood, () => onChange(hood)),
      )}
    </View>
  );
}

/* ────────────────────────── Sheet ────────────────────────── */

/**
 * "Are you out tonight?" — one sheet, three answers on a segmented control
 * (client mockups, Sept 2026):
 *
 * - **I'm out** shows a suggested spot (GPS venue guess, or tonight's spot
 *   if already out) with Change → "Find your spot" (nearby, search, free
 *   text, Private party). Primary: "Check in".
 * - **TBD**: no location at all; an optional area. Primary: "Set as TBD".
 * - **Staying in**: Primary: "Set as staying in".
 *
 * Presented two ways:
 * - Gate mode (`?gate=1`, from NightStatusGate): required opening prompt.
 *   Non-dismissible (layout options), hardware back swallowed.
 * - Update status (no param): same sheet, swipe to dismiss.
 *   `?step=tbd` opens on TBD; `?step=venue` ("Change venue") opens straight
 *   on Find your spot.
 *
 * Picking a segment never writes; only the primary button does. Selecting
 * I'm out reads location only if it is already allowed — the system prompt
 * waits for an explicit "Allow location".
 */
export default function CheckInSheet() {
  const { isNight } = useNightMode();
  // Every way in (Status pill, profile rows, push links, nudges) lands here,
  // so this one guard keeps In / TBD / Out to Night Mode (DAY-NIGHT-MODE-PLAN.md
  // §4.8). The server refuses the write too (guard_night_mode_status).
  return isNight ? <CheckInFlow /> : <NightModeClosed />;
}

/** Day Mode: nothing to set yet — say when it opens, offer a plan instead. */
function NightModeClosed() {
  const { opensLabel } = useNightMode();
  return (
    <View className="pt-7 pb-safe-offset-4 px-5 gap-3">
      <View className="flex-row items-center gap-2">
        <SymbolView name="moon.stars" size={18} tintColor={NEON} />
        <Text className="text-white text-xl font-sans-semibold">Night Mode opens at {opensLabel}</Text>
      </View>
      <Text className="text-white/60 text-sm font-sans leading-5">
        Set In, TBD or Out and check in once tonight goes live. Nothing is shared until you choose.
      </Text>
      <Pressable
        onPress={() => {
          router.back();
          setTimeout(() => router.push('/create-plan'), 350);
        }}
        accessibilityRole="button"
        className={`min-h-12 rounded-full items-center justify-center mt-2 active:opacity-85 ${primaryControl}`}
      >
        <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>Make a plan</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} accessibilityRole="button" className="min-h-11 items-center justify-center">
        <Text className="text-white/70 text-[15px] font-sans-medium">Got it</Text>
      </Pressable>
    </View>
  );
}

function CheckInFlow() {
  const { gate, step: initialStep } = useLocalSearchParams<{ gate?: string; step?: string }>();
  const isGate = gate === '1';
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const { data: own } = useOwnNightStatus();
  const { data: friendIds } = useFriendIds(userId);

  const { data: profile } = useQuery({
    queryKey: ['check-in-profile', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('city, location_sharing_level, display_name')
        .eq('id', userId!)
        .maybeSingle<{
          city: string | null;
          location_sharing_level: string | null;
          display_name: string | null;
        }>();
      const level = data?.location_sharing_level;
      return {
        city: data?.city ?? 'nyc',
        level: isAudience(level) ? level : null,
        displayName: data?.display_name ?? null,
      };
    },
  });
  const city = profile?.city ?? own?.city ?? 'nyc';

  // Audience: the saved level is the default (new users → Friends). Only an
  // explicit change is persisted, so a saved narrower choice is never
  // silently broadened.
  const savedAudience: Audience = profile?.level ?? DEFAULT_AUDIENCE;
  const [audienceOverride, setAudienceOverride] = useState<Audience | null>(null);
  const audience = audienceOverride ?? savedAudience;

  // The answer shown: an explicit tap, else the deep-link step, else
  // tonight's saved answer, else I'm out.
  const [answerChoice, setAnswerChoice] = useState<Answer | null>(
    initialStep === 'tbd' ? 'tbd' : initialStep === 'venue' ? 'yes' : null,
  );
  const answer: Answer = answerChoice ?? answerFromStatus(own?.status) ?? 'yes';

  const [view, setView] = useState<View_>(initialStep === 'venue' ? 'spot' : 'main');

  // Which side new content slides in from. Read during the render that
  // swaps it, before the effects below record the new position.
  const answerIndex = SEGMENTS.findIndex((s) => s.key === answer);
  const shownAnswerIndex = useRef(answerIndex);
  const answerEntering = answerIndex >= shownAnswerIndex.current ? NUDGE_FROM_RIGHT : NUDGE_FROM_LEFT;
  useEffect(() => {
    shownAnswerIndex.current = answerIndex;
  }, [answerIndex]);

  const shownViewDepth = useRef(VIEW_DEPTH[view]);
  const viewEntering = VIEW_DEPTH[view] >= shownViewDepth.current ? PUSH_IN : POP_IN;
  useEffect(() => {
    shownViewDepth.current = VIEW_DEPTH[view];
  }, [view]);

  /**
   * Find your spot fills the sheet. A fitToContents sheet is
   * min(content, largest detent) tall, so content as tall as the large
   * detent makes UIKit grow the sheet to full, animated, through the same
   * path as every other height change here. Changing `sheetAllowedDetents`
   * at runtime would not do: react-native-screens applies that with
   * animate:NO (a snap), and switching back can leave the sheet stuck full.
   * Overshooting by a few points is harmless (the sheet clamps), so the
   * bottom safe area is not subtracted; the list pads past it instead.
   */
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fullSheetHeight = windowHeight - insets.top - LARGE_DETENT_TOP_GAP;

  // The spot shown under I'm out: what the user picked, else tonight's
  // venue if they are already out there, else the GPS guess.
  const [spotChoice, setSpotChoice] = useState<Spot | null>(null);
  const [guess, setGuess] = useState<Spot | null>(null);
  const current = own?.status;
  const currentSpot: Spot | null =
    current && (current.status === 'out' || current.status === 'off') && !current.is_private_party && current.venue_name
      ? { id: current.venue_id, name: current.venue_name }
      : null;
  const spot = spotChoice ?? currentSpot ?? guess;
  const spotIsSuggestion = !spotChoice && !currentSpot && !!guess;

  const [locState, setLocState] = useState<LocState>('idle');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Spot[]>([]);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [detectingHood, setDetectingHood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payoff, setPayoff] = useState<Payoff | null>(null);
  const [venueOnly, setVenueOnly] = useState(false);
  const [auto, setAuto] = useState<AutoUpdates | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectSeq = useRef(0);
  const locStateRef = useRef<LocState>('idle');
  locStateRef.current = locState;

  // Gate mode: Android hardware back must not dismiss the question
  useEffect(() => {
    if (!isGate) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [isGate]);

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      detectSeq.current += 1; // abandon any in-flight GPS fix
    },
    [],
  );

  // TBD carries its saved area back in, so re-opening the sheet shows it.
  const seededArea = useRef(false);
  useEffect(() => {
    if (seededArea.current || current?.status !== 'planning') return;
    seededArea.current = true;
    if (current.planning_neighborhood) {
      setNeighborhood(current.planning_neighborhood);
      setAreaOpen(true);
    }
  }, [current]);

  /* ── Location: suggest a spot for I'm out ──
     Reads location only when already allowed. Not yet asked → the card
     offers "Allow location" (asks for Always: iOS shows While Using first,
     then the upgrade). A permission outcome is never a check-in outcome:
     a denial still lets the user pick or type a spot. */
  const checkLocation = async () => {
    setLocState('checking');
    // A hung plugin must not freeze the sheet: treat it as "no location".
    const permission = await withTimeout(getLocationPermission(), PERMISSION_CHECK_TIMEOUT_MS).catch(
      () => 'denied' as const,
    );
    if (permission === 'not_determined') setLocState('needs-permission');
    else if (permission === 'denied') setLocState('denied');
    else void detectVenue();
  };

  const allowLocation = async () => {
    const permission = await requestAutomaticUpdates().catch(() => 'denied' as const);
    if (hasLocationAccess(permission)) void detectVenue();
    else setLocState('denied');
  };

  /** GPS → nearby venues + best guess (auto-retry with relaxed accuracy). */
  const detectVenue = async () => {
    const seq = ++detectSeq.current;
    setLocState('detecting');
    try {
      let data: LocationData;
      try {
        data = await withTimeout(
          captureLocationWithVenue(isDemoMode() ? GPS_ACCURACY_THRESHOLD_DEMO : undefined),
          GPS_ATTEMPT_TIMEOUT_MS,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        if (msg.includes('accuracy too low') || msg.includes('timeout')) {
          await new Promise((r) => setTimeout(r, 2000));
          data = await withTimeout(captureLocationWithVenue(200), GPS_ATTEMPT_TIMEOUT_MS);
        } else {
          throw err;
        }
      }
      if (seq !== detectSeq.current) return;
      setLocation(data);
      setGuess(data.venueId ? { id: data.venueId, name: data.venueName! } : null);
      setLocState('ready');
    } catch (err) {
      if (seq !== detectSeq.current) return;
      setLocation(null);
      // Transistorsoft error code 1 = permission denied
      const denied = typeof err === 'number' ? err === 1 : (err as { code?: number })?.code === 1;
      setLocState(denied ? 'denied' : 'failed');
    }
  };

  // Start suggesting once I'm out is showing and a suggestion is useful:
  // no spot yet, or the picker (whose Nearby list needs the fix) is open.
  useEffect(() => {
    if (answer !== 'yes' || locState !== 'idle') return;
    if (spot && view !== 'spot') return;
    void checkLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, view, locState, spot]);

  // Returning from Settings: re-check and suggest automatically
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const at = locStateRef.current;
      if (at !== 'denied' && at !== 'needs-permission') return;
      const permission = await getLocationPermission().catch(() => 'denied' as const);
      if (hasLocationAccess(permission) && locStateRef.current === at) void detectVenue();
    });
    return () => sub.remove();
  }, []);

  /** After any successful Yes / TBD / No write: tell the gate, then refresh every status reader. */
  const refreshStatusQueries = () => {
    markNightAnswered();
    invalidateNightStatusQueries(queryClient);
  };

  const showPayoff = async (kind: Payoff['kind'], venueName: string | null, isParty = false) => {
    const counts = await fetchFriendCounts(friendIds ?? []).catch(() => ({ out: 0, planning: 0 }));
    setPayoff({ kind, venueName, isParty, ...counts });
    setView('done');
  };

  /** After a venue check-in is saved: start updates if allowed, describe the rest. */
  const settleAutomaticUpdates = async (uid: string) => {
    const result = await startBackgroundLocation(uid).catch(
      (): TrackingResult => ({ tracking: false, permission: 'denied' }),
    );
    setAuto({ ...result, asked: false });
  };

  const turnOnAutomaticUpdates = async () => {
    if (!userId || autoBusy) return;
    setAutoBusy(true);
    try {
      const result = await enableAutomaticUpdates(userId);
      setAuto({ ...result, asked: true });
    } finally {
      setAutoBusy(false);
    }
  };

  const chooseAnswer = (next: Answer) => {
    setError(null);
    setAnswerChoice(next);
  };

  const openSpotPicker = () => {
    setError(null);
    setView('spot');
  };

  const backToMain = () => {
    Keyboard.dismiss();
    setError(null);
    setQuery('');
    setSearchResults([]);
    setView('main');
  };

  /* ── Venue search (curated venues table; free text allowed) ── */
  const searchVenues = (text: string) => {
    setQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name')
        .eq('city', city)
        .eq('is_demo', false)
        .ilike('name', `%${text.trim()}%`)
        .limit(MAX_SPOT_ROWS);
      setSearchResults(((data ?? []) as Array<{ id: string; name: string }>).map((v) => ({ id: v.id, name: v.name })));
    }, 250);
  };

  const chooseSpot = (next: Spot) => {
    Haptics.selectionAsync();
    setSpotChoice(next);
    setAnswerChoice('yes');
    backToMain();
  };

  /* ── No: record "home" for tonight and get out of the way ── */
  const answerNo = async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await stayIn(userId, { city });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshStatusQueries();
      router.back();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Check in (the only point where I'm out writes anything) ── */
  const checkIn = async () => {
    if (!userId || !spot || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = await goOutAtVenue(userId, {
        venue: { id: spot.id, name: spot.name },
        coords: location
          ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy, recordedAt: location.timestamp }
          : null,
        city,
        audience,
      });
      setVenueOnly(!saved.gpsShared);
      // The check-in is saved. Automatic updates are a separate outcome,
      // reported on the payoff screen — never as a check-in failure.
      void settleAutomaticUpdates(userId);
      void scheduleMorningAfter(city, userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshStatusQueries();
      await showPayoff('out', spot.name);
      fireConfetti(); // the web check-in celebration
    } catch {
      setError('Could not confirm your check-in. Refresh your status before retrying; automatic uploads remain paused.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Private party (a spot type inside I'm out) ── */
  const enterParty = async () => {
    Keyboard.dismiss();
    setError(null);
    setNeighborhood(null);
    setView('party');
    if (!location) return; // no fix → pick from the list, no new prompt
    setDetectingHood(true);
    const detected = await neighborhoodFromCoords(location.lat, location.lng, city);
    setDetectingHood(false);
    if (detected) setNeighborhood(detected);
  };

  const shareParty = async () => {
    if (!userId || !neighborhood || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Exact party GPS goes to eligible Close Friends only.
      const coords = location
        ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy, recordedAt: location.timestamp }
        : await getCurrentPosition();
      const venueName = `Private Party (${neighborhood})`;
      await goOutAtVenue(userId, {
        venue: { id: null, name: venueName },
        coords,
        city,
        audience,
        privateParty: { neighborhood },
      });
      // No background tracking at a private party: the exact spot is for
      // close friends only and a house party does not move.
      void scheduleMorningAfter(city, userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshStatusQueries();
      await showPayoff('out', venueName, true);
      fireConfetti();
    } catch {
      setError('Could not confirm your party. Refresh your status before retrying; automatic uploads remain paused.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── TBD ── */
  const sharePlanning = async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await goPlanning(userId, { city, neighborhood: areaOpen ? neighborhood : null, visibility: audience });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshStatusQueries();
      await showPayoff('planning', null);
    } catch {
      setError('Could not update your status. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const finish = () => router.back();
  const finishToMap = () => {
    router.back();
    // Let the sheet finish dismissing first. Navigating while it is still
    // presented makes iOS present the tabs as a NEW modal card on top of
    // the sheet (every tab then renders inset with rounded corners).
    setTimeout(() => router.navigate('/map'), 400);
  };

  const payoffLine = payoff
    ? payoff.kind === 'out'
      ? payoff.out > 0
        ? `${plural(payoff.out, 'friend')} ${isAre(payoff.out)} out tonight.`
        : "You're the first one out tonight."
      : payoff.out > 0
        ? `${plural(payoff.out, 'friend')} ${isAre(payoff.out)} out tonight.`
        : payoff.planning > 0
          ? `${plural(payoff.planning, 'friend')} ${isAre(payoff.planning)} also deciding.`
          : "Nobody's out yet — you'll see friends here as they head out."
    : '';

  /**
   * Is the Always upgrade on offer right now? Only after a real venue
   * check-in (never a private party — its exact spot is close-friends-only
   * and must not start background GPS), and only while iOS would still
   * honour the prompt: `when_in_use` means the background upgrade alert can
   * still be shown. `asked` flips after the user answers either way, so the
   * payoff screen returns to its normal buttons.
   */
  const offerAlways =
    payoff?.kind === 'out' && !payoff.isParty && auto?.permission === 'when_in_use' && !auto.asked;

  const errorLine = error ? (
    <Animated.View entering={FadeIn.duration(180)} exiting={FADE_AWAY} layout={SHEET_LAYOUT}>
      <Text className="text-amber-400/90 text-xs font-sans">{error}</Text>
    </Animated.View>
  ) : null;

  /* ── Find your spot: list contents ── */
  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  const nearby: Spot[] = (location?.nearbyVenues ?? []).map((v) => ({ id: v.id, name: v.name }));
  // Keep the chosen spot on the list even when GPS didn't return it.
  if (spot?.id && !nearby.some((v) => v.id === spot.id)) nearby.unshift(spot);
  const listed = (searching ? searchResults : nearby).slice(0, MAX_SPOT_ROWS);
  const typedIsNew =
    searching && !searchResults.some((v) => v.name.toLowerCase() === trimmed.toLowerCase());
  const isSelected = (v: Spot) =>
    !!spot && (spot.id ? spot.id === v.id : spot.name.toLowerCase() === v.name.toLowerCase());

  /** The "Suggested spot" card's content when there is no spot yet. */
  const spotPlaceholder = (() => {
    switch (locState) {
      case 'idle':
      case 'checking':
      case 'detecting':
        return { busy: true, text: 'Finding your spot…', action: null };
      case 'needs-permission':
        return { busy: false, text: 'Allow location to get a suggested spot.', action: { label: 'Allow location', onPress: allowLocation } };
      case 'denied':
        return { busy: false, text: 'Location is off. Pick your spot instead.', action: { label: 'Open Settings', onPress: () => void Linking.openSettings() } };
      default:
        return { busy: false, text: 'No spot nearby. Pick yours.', action: null };
    }
  })();

  return (
    // The sheet's own presentation is the opening animation: nothing inside
    // replays an entering animation on top of it, or an exit when it closes.
    <LayoutAnimationConfig skipEntering skipExiting>
      {/* A plain host for the screens, so an outgoing one fades in an
          ordinary view rather than straight inside the native wrapper. */}
      <View>
        {/* ── Are you out tonight? ── */}
        {view === 'main' ? (
          <Animated.View key="main" entering={viewEntering} exiting={FADE_AWAY} className="pt-7 pb-8 px-5 gap-5">
            <View className="gap-1.5">
              <Text className="text-white text-[26px] font-sans-semibold">Are you out tonight?</Text>
              <Text className="text-white/60 text-[15px] font-sans">You can change this anytime.</Text>
            </View>

            <Segments value={answer} onChange={chooseAnswer} disabled={submitting} />

            <Animated.View key={answer} entering={answerEntering} exiting={FADE_AWAY}>
              {answer === 'yes' ? (
                <View className="gap-2.5">
                  <SectionLabel>{spotIsSuggestion ? 'Suggested spot' : 'Your spot'}</SectionLabel>
                  <View className="flex-row items-center rounded-2xl bg-white/6 px-4 min-h-18 py-4">
                    {/* Keyed by what it shows, so "Finding your spot…" fades into the venue. */}
                    {spot ? (
                      <Animated.View
                        key={`spot:${spot.id ?? spot.name}`}
                        entering={FadeIn.duration(200)}
                        className="flex-1 flex-row items-center gap-3"
                      >
                        <MapPin size={20} color={NEON} />
                        <Text className="flex-1 text-white text-lg font-sans-semibold" numberOfLines={1}>
                          {spot.name}
                        </Text>
                        <LinkAction label="Change" onPress={openSpotPicker} />
                      </Animated.View>
                    ) : (
                      <Animated.View
                        key={`placeholder:${spotPlaceholder.text}`}
                        entering={FadeIn.duration(200)}
                        className="flex-1 flex-row items-center gap-3"
                      >
                        {spotPlaceholder.busy ? (
                          <ActivityIndicator size="small" color={NEON} />
                        ) : (
                          <MapPin size={20} color="rgba(255,255,255,0.5)" />
                        )}
                        <View className="flex-1 gap-1">
                          <Text className="text-white/70 text-[15px] font-sans">{spotPlaceholder.text}</Text>
                          {spotPlaceholder.action ? (
                            <Pressable
                              onPress={spotPlaceholder.action.onPress}
                              hitSlop={6}
                              className="self-start active:opacity-70"
                            >
                              <Text className="text-white/60 text-xs font-sans underline">
                                {spotPlaceholder.action.label}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <LinkAction label="Pick" onPress={openSpotPicker} />
                      </Animated.View>
                    )}
                  </View>
                </View>
              ) : answer === 'tbd' ? (
                <View className="gap-4">
                  <InfoCard lines={['Let friends know you might join.', 'Your location won’t be shared.']} />
                  {areaOpen ? (
                    <Animated.View entering={FadeIn.duration(220)} className="gap-2.5">
                      <SectionLabel>Area · optional</SectionLabel>
                      <AreaChips city={city} value={neighborhood} onChange={setNeighborhood} allowNone />
                    </Animated.View>
                  ) : (
                    <Animated.View exiting={FADE_AWAY} className="self-start">
                      <LinkAction label="Add an area · optional" onPress={() => setAreaOpen(true)} />
                    </Animated.View>
                  )}
                </View>
              ) : (
                <InfoCard lines={['You’re staying in tonight.', 'Your location won’t be shared.']} />
              )}
            </Animated.View>

            {errorLine}

            {/* Staying in is never shown to friends (they read out / TBD
                only), so it has no audience to choose. */}
            {answer !== 'no' ? (
              <Animated.View entering={FadeIn.duration(220)} exiting={FADE_AWAY} layout={SHEET_LAYOUT}>
                <AudienceRow flat value={audience} onChange={setAudienceOverride} />
              </Animated.View>
            ) : null}
            <Animated.View layout={SHEET_LAYOUT}>
              <ResetNote
                city={city}
                text={answer === 'yes' ? RESET_COPY.checkInClears : RESET_COPY.statusClears}
              />
            </Animated.View>
            <Animated.View layout={SHEET_LAYOUT}>
              {answer === 'yes' ? (
                <PrimaryButton label="Check in" onPress={checkIn} disabled={!profile || !spot} loading={submitting} />
              ) : answer === 'tbd' ? (
                <PrimaryButton label="Set as TBD" onPress={sharePlanning} disabled={!profile} loading={submitting} />
              ) : (
                <PrimaryButton label="Set as staying in" onPress={answerNo} loading={submitting} />
              )}
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* ── Find your spot ── full height; see fullSheetHeight. */}
        {view === 'spot' ? (
          <Animated.View
            key="spot"
            entering={viewEntering}
            exiting={FADE_AWAY}
            style={{ height: fullSheetHeight }}
            className="pt-7 px-5 gap-5"
          >
            <View className="gap-3">
              <BackLink onPress={backToMain} />
              <Text className="text-white text-[26px] font-sans-semibold">Find your spot</Text>
            </View>

            <View className="flex-row items-center gap-2.5 rounded-2xl bg-black/25 border border-white/15 px-4">
              <Search size={18} color="rgba(255,255,255,0.45)" />
              <TextInput
                value={query}
                onChangeText={searchVenues}
                placeholder="Search venues"
                placeholderTextColorClassName="accent-white/45"
                autoCorrect={false}
                returnKeyType="done"
                className="flex-1 h-13 py-0 text-white text-[16px] font-sans"
              />
            </View>

            {/* The one scroller in this sheet, and safe: it sits in a view of
                fixed height, so the sheet's measured height never depends on
                how many rows arrive or when (the failure that rules scrollers
                out of fitToContents sheets elsewhere). */}
            <ScrollView
              className="flex-1 -mx-5"
              contentContainerClassName="px-5"
              contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              {!searching ? (
                <View className="pb-1">
                  <SectionLabel>Nearby</SectionLabel>
                </View>
              ) : null}

              {!searching && listed.length === 0 ? (
                <View className="flex-row items-center gap-3 py-4 border-b border-white/10">
                  {spotPlaceholder.busy ? <ActivityIndicator size="small" color={NEON} /> : null}
                  <Text className="flex-1 text-white/55 text-sm font-sans">
                    {spotPlaceholder.busy
                      ? 'Finding spots near you…'
                      : locState === 'needs-permission' || locState === 'denied'
                        ? 'Turn on location to see spots near you, or search above.'
                        : 'No spots nearby — search above.'}
                  </Text>
                  {locState === 'needs-permission' ? <LinkAction label="Allow" onPress={allowLocation} /> : null}
                </View>
              ) : null}

              {listed.map((v, i) => (
                // Rows arrive with the GPS fix or a search; they ripple in.
                <Animated.View key={v.id ?? v.name} entering={FadeIn.duration(200).delay(Math.min(i, 8) * 24)}>
                  <SpotRow name={v.name} selected={isSelected(v)} onPress={() => chooseSpot(v)} />
                </Animated.View>
              ))}

              {typedIsNew ? (
                <SpotRow
                  name={`Use “${trimmed}”`}
                  subtitle="Not on the list? Check in by name."
                  icon={CirclePlus}
                  onPress={() => chooseSpot({ id: null, name: trimmed })}
                />
              ) : null}

              <SpotRow
                name="Private party"
                subtitle="Share the label, without a home address."
                icon={House}
                onPress={enterParty}
              />
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* ── Private party ── */}
        {view === 'party' ? (
          <Animated.View key="party" entering={viewEntering} exiting={FADE_AWAY} className="pt-7 pb-8 px-5 gap-5">
            <View className="gap-3">
              <BackLink onPress={() => { setError(null); setView('spot'); }} />
              <View className="gap-1.5">
                <Text className="text-white text-[26px] font-sans-semibold">Private party</Text>
                <Text className="text-white/60 text-[15px] font-sans">
                  No public venue is created and no address is shared.
                </Text>
              </View>
            </View>
            {errorLine}
            <Animated.View layout={SHEET_LAYOUT} className="gap-2.5">
              <SectionLabel>Neighborhood</SectionLabel>
              {detectingHood ? (
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator size="small" color={NEON} />
                  <Text className="text-white/55 text-sm font-sans">Detecting…</Text>
                </View>
              ) : (
                <Animated.View entering={FadeIn.duration(220)}>
                  <AreaChips city={city} value={neighborhood} onChange={setNeighborhood} />
                </Animated.View>
              )}
            </Animated.View>
            <Animated.View layout={SHEET_LAYOUT}>
              <InfoCard
                lines={[
                  'Only Close Friends see your exact spot on the map.',
                  'Everyone else in your audience sees just the neighborhood — no pin.',
                ]}
              />
            </Animated.View>
            <Animated.View layout={SHEET_LAYOUT}>
              <AudienceRow flat value={audience} onChange={setAudienceOverride} />
            </Animated.View>
            <Animated.View layout={SHEET_LAYOUT}>
              <ResetNote city={city} text={RESET_COPY.checkInClears} />
            </Animated.View>
            <Animated.View layout={SHEET_LAYOUT}>
              <PrimaryButton
                label="Check in"
                onPress={shareParty}
                disabled={!profile || !neighborhood}
                loading={submitting}
              />
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* ── Payoff ── */}
        {view === 'done' && payoff ? (
          <Animated.View key="done" entering={FadeIn.duration(240)} className="pt-7 pb-8 px-5 items-center gap-3">
            <View className="w-16 h-16 rounded-full bg-[#d4ff00]/15 items-center justify-center">
              <Check size={30} color={NEON} strokeWidth={2.5} />
            </View>
            <Text className="text-white text-2xl font-sans-semibold">
              {payoff.kind === 'out' ? "You're out." : "You're TBD."}
            </Text>
            <Text className="text-white/70 text-base font-sans text-center">{payoffLine}</Text>
            {payoff.isParty ? <PrimaryButton label="Party invitations & address" onPress={() => router.push(`/party?hostId=${userId}` as never)} /> : null}
            {payoff.venueName ? (
              <Text className="text-white/55 text-xs font-sans text-center">
                Your chosen audience can see your venue status at {payoff.venueName}. {venueOnly && !payoff.isParty ? 'No precise pin or GPS stop was saved.' : ''}
              </Text>
            ) : null}

            {/* Automatic updates — a separate outcome from the check-in above */}
            {payoff.kind === 'out' && !payoff.isParty && auto ? (
              <View className="self-stretch rounded-xl px-4 py-3 bg-[#2d1b4e]/50 border border-white/6 gap-2 mt-1">
                <View className="flex-row items-center gap-2">
                  <Navigation
                    size={16}
                    color={auto.permission === 'always' ? NEON : 'rgba(255,255,255,0.5)'}
                    fill={auto.permission === 'always' ? NEON : 'none'}
                  />
                  <Text className="text-white text-sm font-sans-semibold flex-1">
                    {auto.permission === 'always'
                      ? auto.tracking ? 'Automatic updates on' : 'Location updates unavailable'
                      : auto.permission === 'when_in_use'
                        ? auto.asked
                          ? 'Updates only while Spotted is open'
                          : 'Keep your spot updated automatically?'
                        : 'Automatic updates off'}
                  </Text>
                </View>
                <Text className="text-white/50 text-xs font-sans">
                  {auto.permission === 'always'
                    ? auto.tracking ? "Your spot follows you between bars while your screen is locked. Sharing ends at 5am. Force-quitting stops updates." : 'Your check-in is saved. Check your connection and Location Services to resume updates.'
                    : auto.permission === 'when_in_use'
                      ? auto.asked
                        ? 'Your check-in is active. Move to a new spot and you can update it here.'
                        : 'Automatically update your venue as you move between bars, until 5am. iOS will ask for "Always" and Motion & Fitness.'
                      : 'Your check-in is active. Without location access you update your spot manually.'}
                </Text>
                {/* The Turn on / Not now pair lives in the button stack below,
                    where it is the screen's primary action (see offerAlways). */}
                {auto.permission === 'denied' ? (
                  <Pressable
                    onPress={() => Linking.openSettings()}
                    className="self-start rounded-full px-3 py-1.5 border border-white/15 active:bg-white/5"
                  >
                    <Text className="text-white/70 text-xs font-sans-medium">Open Settings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View className="self-stretch gap-2 pt-2">
              {offerAlways ? (
                /* While the Always upgrade is on offer it IS the primary
                   action. Previously it was a bordered link inside the card
                   above, below a filled "See who's out" — everyone tapped the
                   filled button and iOS never asked for background location
                   again. Leaving is still one tap away, just not the loud one. */
                <>
                  <PrimaryButton
                    label="Turn on automatic updates"
                    onPress={turnOnAutomaticUpdates}
                    loading={autoBusy}
                  />
                  <SecondaryButton
                    label={payoff.out > 0 ? "Not now — see who's out" : 'Not now'}
                    onPress={payoff.out > 0 ? finishToMap : finish}
                  />
                </>
              ) : payoff.out > 0 ? (
                <>
                  <PrimaryButton label="See who's out" onPress={finishToMap} />
                  <SecondaryButton label="Done" onPress={finish} />
                </>
              ) : (
                <PrimaryButton label="Done" onPress={finish} />
              )}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </LayoutAnimationConfig>
  );
}
