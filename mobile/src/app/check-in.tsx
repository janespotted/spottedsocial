import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo-mode';
import { CITY_NEIGHBORHOODS, getCityLabel } from '@/lib/city-neighborhoods';
import {
  captureLocationWithVenue,
  GPS_ACCURACY_THRESHOLD_DEMO,
  neighborhoodFromCoords,
  type LocationData,
  type VenueMatch,
} from '@/lib/location-service';
import { goOutAtVenue, goPlanning, stayIn } from '@/lib/night-status';
import {
  enableAutomaticUpdates,
  getCurrentPosition,
  startBackgroundLocation,
  type TrackingResult,
} from '@/lib/background-location';
import { getLocationPermission, hasLocationAccess } from '@/lib/location-ready';
import { notifyFriendArrived, notifyFriendsPlanning } from '@/lib/notifications';
import { markNightAnswered } from '@/lib/night-gate';
import { DEFAULT_AUDIENCE, isAudience, type Audience } from '@/lib/audience';
import { useSession } from '@/hooks/use-session';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { invalidateNightStatusQueries, useOwnNightStatus } from '@/hooks/use-own-night-status';
import { AudienceRow } from '@/components/audience-row';

const NEON = '#d4ff00';
const PURPLE = '#a855f7';

type Step =
  | 'ask'
  | 'location-intro'
  | 'detecting'
  | 'gps-denied'
  | 'venue'
  | 'party'
  | 'planning'
  | 'done';

const ANSWERS: Array<{ key: 'yes' | 'tbd' | 'no'; label: string; desc: string; icon: SFSymbol }> = [
  { key: 'yes', label: "Yes, I'm out", desc: 'Share your spot with friends', icon: 'mappin.and.ellipse' },
  { key: 'tbd', label: 'TBD', desc: "Thinking about it — let friends know", icon: 'target' },
  { key: 'no', label: 'No, staying in', desc: 'Browse without sharing your location', icon: 'moon.zzz' },
];

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
async function scheduleMorningAfter(): Promise<void> {
  try {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
    await Notifications.scheduleNotificationAsync({
      identifier: 'morning-after-recap', // same id → replaces prior schedule
      content: {
        title: 'Last night on Spotted ☀️',
        body: 'See who you crossed paths with and relive the night.',
        data: { url: '/activity' },
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

/* ────────────────────────── UI pieces ────────────────────────── */

function SheetHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityLabel="Back"
            className="w-8 h-8 -ml-2 rounded-full items-center justify-center active:bg-white/10"
          >
            <SymbolView name="chevron.left" size={16} tintColor="#ffffff" />
          </Pressable>
        ) : null}
        <Text className="text-white text-xl font-sans-semibold flex-1">{title}</Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Close"
            className="w-8 h-8 rounded-full items-center justify-center bg-white/10 active:bg-white/20"
          >
            <SymbolView name="xmark" size={13} tintColor="#ffffff" />
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text className="text-white/50 text-sm font-sans">{subtitle}</Text> : null}
    </View>
  );
}

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
      className="rounded-full py-3.5 items-center active:opacity-90 disabled:opacity-30"
      style={{ backgroundColor: NEON, boxShadow: '0 0 16px rgba(212,255,0,0.25)' }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#1a0f2e" />
      ) : (
        <Text className="text-[#1a0f2e] text-base font-sans-semibold">{label}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full py-3 items-center border border-white/15 active:bg-white/5"
    >
      <Text className="text-white text-sm font-sans-medium">{label}</Text>
    </Pressable>
  );
}

function VenueRow({
  name,
  distance,
  icon = 'mappin',
  onPress,
}: {
  name: string;
  distance?: number;
  icon?: SFSymbol;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-[#2d1b4e]/50 active:bg-[#a855f7]/20"
    >
      <SymbolView name={icon} size={13} tintColor="rgba(255,255,255,0.5)" />
      <Text className="text-white text-sm font-sans flex-1" numberOfLines={1}>
        {name}
      </Text>
      {distance && distance > 0 ? (
        <Text className="text-white/30 text-xs font-sans">{Math.round(distance)}m</Text>
      ) : null}
    </Pressable>
  );
}

/** Neighborhood: detected/selected value with "Change", or the chip grid. */
function NeighborhoodPicker({
  city,
  value,
  onChange,
  detecting,
  allowAnywhere,
}: {
  city: string;
  value: string | null;
  onChange: (hood: string | null) => void;
  detecting?: boolean;
  allowAnywhere?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      className={`px-3 py-2 rounded-xl border ${
        selected ? 'bg-[#a855f7]/25 border-[#a855f7]/40' : 'bg-[#2d1b4e]/50 border-transparent'
      }`}
    >
      <Text className={`text-xs font-sans ${selected ? 'text-[#d4ff00]' : 'text-white/70'}`}>
        {label}
      </Text>
    </Pressable>
  );
  const hasChoice = value !== null || allowAnywhere;

  return (
    <View className="gap-2">
      <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
        Neighborhood
      </Text>
      {detecting ? (
        <View className="flex-row items-center gap-2 py-2">
          <ActivityIndicator size="small" color={NEON} />
          <Text className="text-white/50 text-sm font-sans">Detecting...</Text>
        </View>
      ) : hasChoice && !expanded ? (
        <View className="flex-row items-center gap-2">
          <View className="rounded-xl px-4 py-2.5 bg-[#a855f7]/20 border border-[#a855f7]/40">
            <Text className="text-[#d4ff00] text-sm font-sans-semibold">
              {value ?? `Anywhere in ${getCityLabel(city)}`}
            </Text>
          </View>
          <Pressable onPress={() => setExpanded(true)} hitSlop={6}>
            <Text className="text-white/50 text-sm font-sans underline">Change</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 180 }}>
          <View className="flex-row flex-wrap gap-2">
            {allowAnywhere
              ? chip(`Anywhere in ${getCityLabel(city)}`, value === null, () => {
                  onChange(null);
                  setExpanded(false);
                })
              : null}
            {(CITY_NEIGHBORHOODS[city] ?? []).map((hood) =>
              chip(hood, value === hood, () => {
                onChange(hood);
                setExpanded(false);
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/* ────────────────────────── Sheet ────────────────────────── */

/**
 * "Are you out tonight?" — Yes / TBD / No.
 *
 * Presented two ways:
 * - Gate mode (`?gate=1`, from NightStatusGate): required opening prompt.
 *   Non-dismissible (layout options), no close/skip, hardware back swallowed.
 * - Update status (no param): same sheet, dismissible, with a close button.
 *   `?step=tbd` opens straight on the TBD setup (Plans segment control).
 *
 * Nothing is written until a final action: "Share my spot" (Yes), "Share TBD
 * status" (TBD) or the No button. Yes runs GPS venue detection only; TBD
 * touches no location APIs at all.
 */
export default function CheckInSheet() {
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

  const [step, setStep] = useState<Step>(initialStep === 'tbd' ? 'planning' : 'ask');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueMatch | null>(null);
  const [guessedVenueId, setGuessedVenueId] = useState<string | null>(null);
  const [venueExpanded, setVenueExpanded] = useState(false);
  const [customVenue, setCustomVenue] = useState('');
  const [searchResults, setSearchResults] = useState<VenueMatch[]>([]);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [detectingHood, setDetectingHood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payoff, setPayoff] = useState<Payoff | null>(null);
  const [auto, setAuto] = useState<AutoUpdates | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectSeq = useRef(0);
  const stepRef = useRef<Step>('ask');
  stepRef.current = step;

  // Gate mode: Android hardware back must not dismiss the question
  useEffect(() => {
    if (!isGate) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [isGate]);

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    []
  );

  /** After any successful Yes / TBD / No write: tell the gate, then refresh every status reader. */
  const refreshStatusQueries = () => {
    markNightAnswered();
    invalidateNightStatusQueries(queryClient);
  };

  const persistAudience = async () => {
    if (!userId || !audienceOverride || audienceOverride === savedAudience) return;
    await supabase
      .from('profiles')
      .update({ location_sharing_level: audienceOverride })
      .eq('id', userId);
    queryClient.invalidateQueries({ queryKey: ['check-in-profile'] });
  };

  const showPayoff = async (kind: Payoff['kind'], venueName: string | null, isParty = false) => {
    const counts = await fetchFriendCounts(friendIds ?? []).catch(() => ({ out: 0, planning: 0 }));
    setPayoff({ kind, venueName, isParty, ...counts });
    setStep('done');
  };

  /* ── Location permission (client feedback §3) ──
     Yes explains before asking, asks for When In Use only, and never
     treats a permission outcome as a check-in outcome. */
  const startYes = async () => {
    // A hung plugin must not freeze the sheet: treat it as "no location",
    // which still offers Pick a venue.
    const permission = await withTimeout(getLocationPermission(), PERMISSION_CHECK_TIMEOUT_MS).catch(
      () => 'denied' as const
    );
    if (permission === 'not_determined') setStep('location-intro');
    else if (permission === 'denied') setStep('gps-denied');
    else detectVenue();
  };

  // Returning from Settings: re-check and move on automatically
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const current = stepRef.current;
      if (current !== 'gps-denied' && current !== 'location-intro') return;
      const permission = await getLocationPermission().catch(() => 'denied' as const);
      if (hasLocationAccess(permission) && stepRef.current === current) detectVenue();
    });
    return () => sub.remove();
  }, []);

  /** After a venue check-in is saved: start updates if allowed, describe the rest. */
  const settleAutomaticUpdates = async (uid: string) => {
    const result = await startBackgroundLocation(uid).catch(
      (): TrackingResult => ({ tracking: false, permission: 'denied' })
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

  const backToAsk = () => {
    detectSeq.current += 1; // abandon any in-flight GPS fix
    setError(null);
    setStep('ask');
  };

  /* ── Yes: GPS → best venue guess (auto-retry with relaxed accuracy) ── */
  const detectVenue = async () => {
    const seq = ++detectSeq.current;
    setStep('detecting');
    setError(null);
    try {
      let data: LocationData;
      try {
        data = await withTimeout(
          captureLocationWithVenue(DEMO_MODE ? GPS_ACCURACY_THRESHOLD_DEMO : undefined),
          GPS_ATTEMPT_TIMEOUT_MS
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
      if (seq !== detectSeq.current) return; // user went back
      setLocation(data);
      const guess = data.venueId ? { id: data.venueId, name: data.venueName!, distance: 0 } : null;
      setSelectedVenue(guess);
      setGuessedVenueId(guess?.id ?? null);
      setVenueExpanded(!guess);
      setStep('venue');
    } catch (err) {
      if (seq !== detectSeq.current) return;
      // Transistorsoft error code 1 = permission denied
      if (typeof err === 'number' ? err === 1 : (err as { code?: number })?.code === 1) {
        setStep('gps-denied');
      } else {
        setError(err instanceof Error ? err.message : 'Could not get your location.');
        setLocation(null);
        setSelectedVenue(null);
        setVenueExpanded(true);
        setStep('venue'); // manual venue entry still works without GPS
      }
    }
  };

  const pickVenueManually = () => {
    setError(null);
    setLocation(null);
    setSelectedVenue(null);
    setVenueExpanded(true);
    setStep('venue');
  };

  const handleAnswer = (key: 'yes' | 'tbd' | 'no') => {
    if (!userId) return;
    setError(null);
    if (key === 'yes') {
      startYes();
    } else if (key === 'tbd') {
      // TBD never asks for location — neighborhood is optional and manual
      setNeighborhood(null);
      setStep('planning');
    } else {
      answerNo();
    }
  };

  /* ── No: record "home" for tonight and get out of the way ── */
  const answerNo = async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
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

  /* ── Venue search (curated venues table; free text allowed) ── */
  const searchVenues = (query: string) => {
    setCustomVenue(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name')
        .eq('city', city)
        .eq('is_demo', false)
        .ilike('name', `%${query.trim()}%`)
        .limit(8);
      setSearchResults(
        ((data ?? []) as Array<{ id: string; name: string }>).map((v) => ({
          id: v.id,
          name: v.name,
          distance: 0,
        }))
      );
    }, 250);
  };

  const chooseVenue = (venue: VenueMatch) => {
    setSelectedVenue(venue);
    setCustomVenue('');
    setSearchResults([]);
    setVenueExpanded(false);
  };

  /* ── Share my spot (the only point where "Yes" writes anything) ── */
  const shareSpot = async () => {
    if (!userId || submitting) return;
    const venueName = selectedVenue?.name ?? customVenue.trim();
    if (!venueName) return;
    setSubmitting(true);
    setError(null);
    try {
      await goOutAtVenue(userId, {
        venue: { id: selectedVenue?.id ?? null, name: venueName },
        coords: location ? { lat: location.lat, lng: location.lng } : null,
        city,
      });
      await persistAudience();
      // The check-in is saved. Automatic updates are a separate outcome,
      // reported on the payoff screen — never as a check-in failure.
      settleAutomaticUpdates(userId);
      scheduleMorningAfter();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (selectedVenue?.id) {
        notifyFriendArrived(
          userId,
          profile?.displayName?.split(' ')[0] ?? 'A friend',
          selectedVenue.id,
          venueName
        );
      }
      refreshStatusQueries();
      await showPayoff('out', venueName);
    } catch {
      setError('Could not share your spot. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Private party (a location type inside Yes) ── */
  const enterParty = async () => {
    setError(null);
    setNeighborhood(null);
    setStep('party');
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
      // Exact GPS goes to close/direct friends only (mutuals get no pin)
      const coords = location
        ? { lat: location.lat, lng: location.lng }
        : await getCurrentPosition();
      const venueName = `Private Party (${neighborhood})`;
      await goOutAtVenue(userId, {
        venue: { id: null, name: venueName },
        coords,
        city,
        privateParty: { neighborhood },
      });
      await persistAudience();
      // No background tracking at a private party: the exact spot is for
      // close friends only and a house party does not move.
      scheduleMorningAfter();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshStatusQueries();
      await showPayoff('out', venueName, true);
    } catch {
      setError('Could not start your party. Try again.');
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
      await goPlanning(userId, { city, neighborhood, visibility: audience });
      await persistAudience();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notifyFriendsPlanning(userId, audience);
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

  const currentLine = own?.status
    ? own.status.status === 'out'
      ? `Right now: out at ${own.status.venue_name ?? 'a spot'}`
      : own.status.status === 'planning'
        ? 'Right now: TBD'
        : own.status.status === 'off'
          ? 'Right now: out, location hidden'
          : 'Right now: staying in'
    : null;

  const nearbyCandidates = (location?.nearbyVenues ?? [])
    .filter((v) => v.id !== selectedVenue?.id)
    .slice(0, 4);
  const canShare = !!profile && (!!selectedVenue || customVenue.trim().length > 0);

  const payoffLine = payoff
    ? payoff.kind === 'out'
      ? payoff.out > 0
        ? `${plural(payoff.out, 'friend')} ${isAre(payoff.out)} nearby.`
        : "You're the first one out tonight."
      : payoff.out > 0
        ? `${plural(payoff.out, 'friend')} ${isAre(payoff.out)} out tonight.`
        : payoff.planning > 0
          ? `${plural(payoff.planning, 'friend')} ${isAre(payoff.planning)} also deciding.`
          : "Nobody's out yet — you'll see friends here as they head out."
    : '';

  return (
    <View className="pt-6 pb-8 px-5 gap-4" style={{ minHeight: 320 }}>
      {/* ── Are you out tonight? ── */}
      {step === 'ask' ? (
        <>
          <SheetHeader
            title="Are you out tonight?"
            subtitle={currentLine ?? 'Let friends know. You can change this anytime.'}
            onClose={isGate ? undefined : finish}
          />
          {error ? <Text className="text-amber-400/90 text-xs font-sans">{error}</Text> : null}
          <View className="gap-3">
            {ANSWERS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => handleAnswer(opt.key)}
                disabled={submitting}
                className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-[#2d1b4e]/50 border border-white/[0.06] active:bg-[#a855f7]/20 disabled:opacity-60"
              >
                <View className="w-10 h-10 rounded-full bg-[#a855f7]/15 items-center justify-center">
                  {submitting && opt.key === 'no' ? (
                    <ActivityIndicator size="small" color={PURPLE} />
                  ) : (
                    <SymbolView name={opt.icon} size={18} tintColor={PURPLE} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-white text-base font-sans-medium">{opt.label}</Text>
                  <Text className="text-white/40 text-xs font-sans">{opt.desc}</Text>
                </View>
                <SymbolView name="chevron.right" size={14} tintColor="rgba(255,255,255,0.3)" />
              </Pressable>
            ))}
          </View>
          <Text className="text-white/30 text-xs font-sans text-center">
            Statuses reset at 5:00 AM {getCityLabel(city)} time
          </Text>
        </>
      ) : null}

      {/* ── Why location, before the system prompt ── */}
      {step === 'location-intro' ? (
        <>
          <SheetHeader title="Find your spot" onBack={backToAsk} />
          <View className="items-center py-2 gap-3">
            <SymbolView name="location.circle" size={36} tintColor={PURPLE} />
            <Text className="text-white/70 text-sm font-sans text-center">
              Spotted uses your location to guess the venue you&apos;re at. Nothing is shared
              until you tap &ldquo;Share my spot&rdquo;, and only the friends you choose can see
              it.
            </Text>
            <Text className="text-white/40 text-xs font-sans text-center">
              iOS will ask for &ldquo;While Using the App&rdquo; access next.
            </Text>
          </View>
          <PrimaryButton label="Continue" onPress={detectVenue} />
          <SecondaryButton label="Pick a venue instead" onPress={pickVenueManually} />
        </>
      ) : null}

      {/* ── Detecting ── */}
      {step === 'detecting' ? (
        <>
          <SheetHeader title="Finding your spot" onBack={backToAsk} />
          <View className="items-center py-12 gap-4">
            <ActivityIndicator color={NEON} size="large" />
            <Text className="text-white/60 text-sm font-sans">Checking nearby venues...</Text>
          </View>
        </>
      ) : null}

      {/* ── GPS permission denied ── */}
      {step === 'gps-denied' ? (
        <>
          <SheetHeader title="Location access is off" onBack={backToAsk} />
          <View className="items-center py-2 gap-3">
            <SymbolView name="location.slash" size={36} tintColor="rgba(168,85,247,0.6)" />
            <Text className="text-white/70 text-sm font-sans text-center">
              Everything still works: pick your venue yourself, share it, and see who&apos;s out.
              Location only lets Spotted guess the venue for you.
            </Text>
            <Text className="text-white/40 text-xs font-sans text-center">
              Allow &ldquo;While Using the App&rdquo; in Settings and come back — this screen
              updates on its own.
            </Text>
          </View>
          <PrimaryButton label="Pick a venue" onPress={pickVenueManually} />
          <SecondaryButton label="Open Settings" onPress={() => Linking.openSettings()} />
        </>
      ) : null}

      {/* ── Venue confirm / pick ── */}
      {step === 'venue' ? (
        <>
          <SheetHeader
            title={
              selectedVenue && !venueExpanded
                ? selectedVenue.id === guessedVenueId
                  ? "Looks like you're at"
                  : "You're at"
                : 'Where are you?'
            }
            onBack={backToAsk}
          />
          {error ? <Text className="text-amber-400/90 text-xs font-sans">{error}</Text> : null}

          {selectedVenue ? (
            <View className="rounded-xl px-4 py-3.5 bg-[#a855f7]/20 border border-[#a855f7]/40">
              <Text className="text-[#d4ff00] text-lg font-sans-semibold">{selectedVenue.name}</Text>
            </View>
          ) : null}

          {venueExpanded ? (
            <View className="gap-3">
              {nearbyCandidates.length > 0 ? (
                <View className="gap-1.5">
                  <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
                    Nearby
                  </Text>
                  {nearbyCandidates.map((venue) => (
                    <VenueRow
                      key={venue.id}
                      name={venue.name}
                      distance={venue.distance}
                      onPress={() => chooseVenue(venue)}
                    />
                  ))}
                </View>
              ) : null}

              <View className="gap-1.5">
                <TextInput
                  value={customVenue}
                  onChangeText={searchVenues}
                  placeholder="Search or type a venue..."
                  placeholderTextColorClassName="accent-white/30"
                  className="rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white text-[15px] font-sans"
                />
                {searchResults.map((venue) => (
                  <VenueRow key={venue.id} name={venue.name} onPress={() => chooseVenue(venue)} />
                ))}
              </View>

              <VenueRow name="Private party / house party" icon="house" onPress={enterParty} />
            </View>
          ) : null}

          <AudienceRow value={audience} onChange={setAudienceOverride} />

          <PrimaryButton
            label="Share my spot"
            onPress={shareSpot}
            disabled={!canShare}
            loading={submitting}
          />
          {!venueExpanded ? (
            <SecondaryButton label="Not here" onPress={() => setVenueExpanded(true)} />
          ) : null}
        </>
      ) : null}

      {/* ── Private party ── */}
      {step === 'party' ? (
        <>
          <SheetHeader
            title="Private party"
            subtitle="No public venue is created and no address is shared."
            onBack={() => {
              setError(null);
              setStep('venue');
            }}
          />
          {error ? <Text className="text-amber-400/90 text-xs font-sans">{error}</Text> : null}
          <NeighborhoodPicker
            city={city}
            value={neighborhood}
            onChange={setNeighborhood}
            detecting={detectingHood}
          />
          <AudienceRow value={audience} onChange={setAudienceOverride} />
          <Text className="text-white/40 text-xs font-sans">
            Only Close Friends see your exact spot on the map. Everyone else in your audience sees
            just the neighborhood — no pin.
          </Text>
          <PrimaryButton
            label="Share my spot"
            onPress={shareParty}
            disabled={!profile || !neighborhood}
            loading={submitting}
          />
        </>
      ) : null}

      {/* ── TBD ── */}
      {step === 'planning' ? (
        <>
          <SheetHeader
            title="Thinking about going out?"
            subtitle="Friends will see you're TBD. No location needed."
            onBack={backToAsk}
          />
          {error ? <Text className="text-amber-400/90 text-xs font-sans">{error}</Text> : null}
          <NeighborhoodPicker city={city} value={neighborhood} onChange={setNeighborhood} allowAnywhere />
          <AudienceRow value={audience} onChange={setAudienceOverride} />
          <PrimaryButton
            label="Share TBD status"
            onPress={sharePlanning}
            disabled={!profile}
            loading={submitting}
          />
        </>
      ) : null}

      {/* ── Payoff ── */}
      {step === 'done' && payoff ? (
        <View className="items-center gap-3 py-2">
          <View className="w-16 h-16 rounded-full bg-[#d4ff00]/15 items-center justify-center">
            <SymbolView name="checkmark" size={28} tintColor={NEON} />
          </View>
          <Text className="text-white text-2xl font-sans-semibold">
            {payoff.kind === 'out' ? "You're out." : "You're TBD."}
          </Text>
          <Text className="text-white/70 text-base font-sans text-center">{payoffLine}</Text>
          {payoff.venueName ? (
            <Text className="text-white/40 text-xs font-sans text-center">
              Friends can see you at {payoff.venueName}.
            </Text>
          ) : null}

          {/* Automatic updates — a separate outcome from the check-in above */}
          {payoff.kind === 'out' && !payoff.isParty && auto ? (
            <View className="self-stretch rounded-xl px-4 py-3 bg-[#2d1b4e]/50 border border-white/[0.06] gap-2 mt-1">
              <View className="flex-row items-center gap-2">
                <SymbolView
                  name={auto.permission === 'always' ? 'location.fill' : 'location'}
                  size={14}
                  tintColor={auto.permission === 'always' ? NEON : 'rgba(255,255,255,0.5)'}
                />
                <Text className="text-white text-sm font-sans-semibold flex-1">
                  {auto.permission === 'always'
                    ? 'Automatic updates on'
                    : auto.permission === 'when_in_use'
                      ? auto.asked
                        ? 'Updates only while Spotted is open'
                        : 'Keep your spot updated automatically?'
                      : 'Automatic updates off'}
                </Text>
              </View>
              <Text className="text-white/50 text-xs font-sans">
                {auto.permission === 'always'
                  ? "If you move to another spot, friends see it even when Spotted is closed."
                  : auto.permission === 'when_in_use'
                    ? auto.asked
                      ? 'Your check-in is active. Move to a new spot and you can update it here.'
                      : 'Your check-in is active. With background access, moving to a new spot updates automatically — iOS will ask for "Always" and Motion & Fitness.'
                    : 'Your check-in is active. Without location access you update your spot manually.'}
              </Text>
              {auto.permission === 'when_in_use' && !auto.asked ? (
                <View className="flex-row gap-2 pt-1">
                  <Pressable
                    onPress={turnOnAutomaticUpdates}
                    disabled={autoBusy}
                    className="flex-1 rounded-full py-2 items-center border border-[#d4ff00]/50 active:bg-[#d4ff00]/10 disabled:opacity-50"
                  >
                    {autoBusy ? (
                      <ActivityIndicator size="small" color={NEON} />
                    ) : (
                      <Text className="text-[#d4ff00] text-sm font-sans-medium">Turn on</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setAuto({ ...auto, asked: true })}
                    className="flex-1 rounded-full py-2 items-center active:opacity-70"
                  >
                    <Text className="text-white/50 text-sm font-sans-medium">Not now</Text>
                  </Pressable>
                </View>
              ) : null}
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
            {payoff.out > 0 ? (
              <>
                <PrimaryButton label="See who's out" onPress={finishToMap} />
                <SecondaryButton label="Done" onPress={finish} />
              </>
            ) : (
              <PrimaryButton label="Done" onPress={finish} />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
