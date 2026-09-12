import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ActionSheetIOS } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo-mode';
import { CITY_NEIGHBORHOODS, getCityLabel } from '@/lib/city-neighborhoods';
import {
  captureLocationWithVenue,
  detectNeighborhoodFromGPS,
  GPS_ACCURACY_THRESHOLD_DEMO,
  type LocationData,
  type VenueMatch,
} from '@/lib/location-service';
import { goOutAtVenue, goPlanning, stopSharing } from '@/lib/night-status';
import { getCurrentPosition, startBackgroundLocation } from '@/lib/background-location';
import { notifyFriendArrived, notifyFriendsPlanning } from '@/lib/notifications';
import { useSession } from '@/hooks/use-session';

const NEON = '#d4ff00';

type Audience = 'close_friends' | 'all_friends' | 'mutual_friends';
type Step = 'status' | 'detecting' | 'venue' | 'planning' | 'party' | 'gps-denied';

const AUDIENCES: Array<{ value: Audience; label: string }> = [
  { value: 'close_friends', label: 'Close Friends' },
  { value: 'all_friends', label: 'All Friends' },
  { value: 'mutual_friends', label: 'Mutual Friends' },
];

const STATUS_OPTIONS: Array<{
  key: 'out' | 'planning' | 'private_party' | 'home';
  label: string;
  desc: string;
  icon: SFSymbol;
}> = [
  { key: 'out', label: "I'm Out", desc: 'Share your spot with friends', icon: 'mappin.and.ellipse' },
  { key: 'planning', label: 'Planning Tonight', desc: "TBD — let friends know you're deciding", icon: 'target' },
  { key: 'private_party', label: 'Private Party', desc: 'House party — exact spot for close friends only', icon: 'house' },
  { key: 'home', label: 'Staying In', desc: "You won't appear on tonight's list", icon: 'moon.zzz' },
];

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

function AudiencePicker({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (a: Audience) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
        Who can see you
      </Text>
      <View className="flex-row gap-2">
        {AUDIENCES.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 px-2 py-2.5 rounded-xl border items-center ${
              value === opt.value
                ? 'bg-[#a855f7]/25 border-[#a855f7]/40'
                : 'bg-[#2d1b4e]/50 border-transparent'
            }`}
          >
            <Text
              className={`text-xs text-center ${
                value === opt.value ? 'text-[#d4ff00] font-sans-semibold' : 'text-white/70 font-sans'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Check-in flow — native form sheet. Port of the web CheckInModal core:
 * Out (GPS → venue confirm → audience → go live), Planning (audience →
 * neighborhood), Staying In. Private party, reminders, and heading-out
 * defer to a later pass.
 */
export default function CheckInSheet() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const [step, setStep] = useState<Step>('status');
  const [audience, setAudience] = useState<Audience>('close_friends');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueMatch | null>(null);
  const [customVenue, setCustomVenue] = useState('');
  const [searchResults, setSearchResults] = useState<VenueMatch[]>([]);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [detectingHood, setDetectingHood] = useState(false);
  const [showHoodPicker, setShowHoodPicker] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: city } = useQuery({
    queryKey: ['home-city', userId],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', userId!)
        .maybeSingle<{ city: string | null }>();
      return data?.city ?? 'nyc';
    },
  });

  const refreshStatusQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['my-night-status'] });
    queryClient.invalidateQueries({ queryKey: ['map-data'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    queryClient.invalidateQueries({ queryKey: ['friends-out'] });
  };

  /* ── Out: GPS → venue candidates (auto-retry with relaxed threshold) ── */
  const detectVenue = async () => {
    setStep('detecting');
    setGpsError(null);
    try {
      let data: LocationData;
      try {
        data = await captureLocationWithVenue(DEMO_MODE ? GPS_ACCURACY_THRESHOLD_DEMO : undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        if (msg.includes('accuracy too low') || msg.includes('timeout')) {
          await new Promise((r) => setTimeout(r, 2000));
          data = await captureLocationWithVenue(200);
        } else {
          throw err;
        }
      }
      setLocation(data);
      setSelectedVenue(data.venueId ? { id: data.venueId, name: data.venueName!, distance: 0 } : null);
      setStep('venue');
    } catch (err) {
      // Transistorsoft error code 1 = permission denied
      if (typeof err === 'number' ? err === 1 : (err as { code?: number })?.code === 1) {
        setStep('gps-denied');
      } else {
        setGpsError(err instanceof Error ? err.message : 'Could not get your location.');
        setLocation(null);
        setSelectedVenue(null);
        setStep('venue'); // manual venue entry still works without GPS
      }
    }
  };

  const handleStatus = async (key: 'out' | 'planning' | 'private_party' | 'home') => {
    if (!userId) return;
    if (key === 'out') {
      detectVenue();
    } else if (key === 'planning' || key === 'private_party') {
      setStep(key === 'planning' ? 'planning' : 'party');
      setShowHoodPicker(false);
      setNeighborhood(null);
      if (key === 'private_party') setAudience('close_friends');
      setDetectingHood(true);
      const detected = await detectNeighborhoodFromGPS(city ?? 'nyc');
      setDetectingHood(false);
      if (detected) setNeighborhood(detected);
      else setShowHoodPicker(true);
    } else {
      setSubmitting(true);
      try {
        await stopSharing(userId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refreshStatusQueries();
        router.back();
      } finally {
        setSubmitting(false);
      }
    }
  };

  /** "Remind me later" — local notification deep-linking back to check-in. */
  const scheduleReminder = () => {
    const options = ['In 30 minutes', 'In 1 hour', 'In 2 hours', 'Cancel'];
    const minutes = [30, 60, 120];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Remind me to go live', options, cancelButtonIndex: 3 },
      async (index) => {
        if (index >= minutes.length) return;
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: 'checkin-reminder', // same id → replaces prior reminder
            content: {
              title: 'Going out tonight? 🌃',
              body: 'Go live so friends can find you.',
              data: { url: '/check-in' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: minutes[index] * 60,
            },
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        } catch {
          /* notifications denied */
        }
      }
    );
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
        .eq('city', city ?? 'nyc')
        .eq('is_demo', false)
        .ilike('name', `%${query.trim()}%`)
        .limit(8);
      setSearchResults(((data ?? []) as Array<{ id: string; name: string }>).map((v) => ({
        id: v.id,
        name: v.name,
        distance: 0,
      })));
    }, 250);
  };

  const goLive = async () => {
    if (!userId || submitting) return;
    const venueName = selectedVenue?.name ?? customVenue.trim();
    if (!venueName) return;
    setSubmitting(true);
    try {
      await goOutAtVenue(userId, {
        venue: { id: selectedVenue?.id ?? null, name: venueName },
        coords: location ? { lat: location.lat, lng: location.lng } : null,
        city,
      });
      // The check-in picker IS the sharing control (web parity)
      await supabase.from('profiles').update({ location_sharing_level: audience }).eq('id', userId);
      await startBackgroundLocation(userId);
      scheduleMorningAfter();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (selectedVenue?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle();
        notifyFriendArrived(
          userId,
          profile?.display_name?.split(' ')[0] ?? 'A friend',
          selectedVenue.id,
          venueName
        );
      }
      refreshStatusQueries();
      router.back();
    } catch {
      setGpsError('Could not check in. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmParty = async () => {
    if (!userId || !neighborhood || submitting) return;
    setSubmitting(true);
    try {
      // Exact GPS goes to close/direct friends only (mutuals get no pin)
      const coords = await getCurrentPosition();
      await goOutAtVenue(userId, {
        venue: { id: null, name: `Private Party (${neighborhood})` },
        coords,
        city,
        privateParty: { neighborhood },
      });
      await supabase.from('profiles').update({ location_sharing_level: audience }).eq('id', userId);
      await startBackgroundLocation(userId);
      scheduleMorningAfter();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshStatusQueries();
      router.back();
    } catch {
      setGpsError('Could not start your party. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPlanning = async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    try {
      await goPlanning(userId, { city, neighborhood, visibility: audience });
      await supabase.from('profiles').update({ location_sharing_level: audience }).eq('id', userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notifyFriendsPlanning(userId, audience);
      refreshStatusQueries();
      router.back();
    } catch {
      setGpsError('Could not update your status. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    []
  );

  return (
    <View className="pt-6 pb-8 px-5" style={{ minHeight: 320 }}>
      {/* ── Status selection ── */}
      {step === 'status' ? (
        <View className="gap-3">
          <Text className="text-white text-lg font-sans-semibold mb-1">Go Live</Text>
          {STATUS_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => handleStatus(opt.key)}
              disabled={submitting}
              className="flex-row items-center gap-3 rounded-xl px-4 py-3.5 bg-[#2d1b4e]/50 border border-white/[0.06] active:bg-[#a855f7]/20"
            >
              <View className="w-10 h-10 rounded-full bg-[#a855f7]/15 items-center justify-center">
                <SymbolView name={opt.icon} size={18} tintColor="#a855f7" />
              </View>
              <View className="flex-1">
                <Text className="text-white text-base font-sans-medium">{opt.label}</Text>
                <Text className="text-white/40 text-xs font-sans">{opt.desc}</Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor="rgba(255,255,255,0.3)" />
            </Pressable>
          ))}
          <Pressable
            onPress={scheduleReminder}
            className="flex-row items-center justify-center gap-2 py-2.5 active:opacity-70"
          >
            <SymbolView name="clock" size={13} tintColor="rgba(255,255,255,0.4)" />
            <Text className="text-white/40 text-sm font-sans">Remind me later</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Detecting ── */}
      {step === 'detecting' ? (
        <View className="items-center py-16 gap-4">
          <ActivityIndicator color={NEON} size="large" />
          <Text className="text-white/60 text-sm font-sans">Finding your spot...</Text>
        </View>
      ) : null}

      {/* ── GPS permission denied ── */}
      {step === 'gps-denied' ? (
        <View className="items-center py-10 gap-4">
          <SymbolView name="location.slash" size={36} tintColor="rgba(168,85,247,0.6)" />
          <Text className="text-white text-base font-sans-semibold text-center">
            Location access is off
          </Text>
          <Text className="text-white/50 text-sm font-sans text-center">
            Spotted needs your location to detect the venue you&apos;re at.
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            className="rounded-full px-6 py-2.5 active:opacity-90"
            style={{ backgroundColor: NEON }}
          >
            <Text className="text-[#1a0f2e] font-sans-medium">Open Settings</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Venue confirm ── */}
      {step === 'venue' ? (
        <View className="gap-4">
          <Text className="text-white text-lg font-sans-semibold">
            {selectedVenue ? "Looks like you're at" : 'Where are you?'}
          </Text>
          {gpsError ? (
            <Text className="text-amber-400/90 text-xs font-sans">{gpsError}</Text>
          ) : null}

          {selectedVenue ? (
            <View className="rounded-xl px-4 py-3.5 bg-[#a855f7]/20 border border-[#a855f7]/40">
              <Text className="text-[#d4ff00] text-lg font-sans-semibold">{selectedVenue.name}</Text>
            </View>
          ) : null}

          {/* Nearby candidates */}
          {(location?.nearbyVenues ?? []).filter((v) => v.id !== selectedVenue?.id).slice(0, 4)
            .length > 0 ? (
            <View className="gap-1.5">
              <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
                Nearby
              </Text>
              {(location?.nearbyVenues ?? [])
                .filter((v) => v.id !== selectedVenue?.id)
                .slice(0, 4)
                .map((venue) => (
                  <Pressable
                    key={venue.id}
                    onPress={() => {
                      setSelectedVenue(venue);
                      setCustomVenue('');
                      setSearchResults([]);
                    }}
                    className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-[#2d1b4e]/50 active:bg-[#a855f7]/20"
                  >
                    <SymbolView name="mappin" size={13} tintColor="rgba(255,255,255,0.5)" />
                    <Text className="text-white text-sm font-sans flex-1" numberOfLines={1}>
                      {venue.name}
                    </Text>
                    {venue.distance > 0 ? (
                      <Text className="text-white/30 text-xs font-sans">
                        {Math.round(venue.distance)}m
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
            </View>
          ) : null}

          {/* Somewhere else */}
          <View className="gap-1.5">
            <TextInput
              value={customVenue}
              onChangeText={searchVenues}
              placeholder="Somewhere else..."
              placeholderTextColorClassName="accent-white/30"
              className="rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white text-[15px] font-sans"
            />
            {searchResults.map((venue) => (
              <Pressable
                key={venue.id}
                onPress={() => {
                  setSelectedVenue(venue);
                  setCustomVenue('');
                  setSearchResults([]);
                }}
                className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-[#2d1b4e]/50 active:bg-[#a855f7]/20"
              >
                <SymbolView name="mappin" size={13} tintColor="rgba(255,255,255,0.5)" />
                <Text className="text-white text-sm font-sans flex-1" numberOfLines={1}>
                  {venue.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <AudiencePicker value={audience} onChange={setAudience} />

          <Pressable
            onPress={goLive}
            disabled={submitting || (!selectedVenue && !customVenue.trim())}
            className="rounded-full py-3.5 items-center active:opacity-90 disabled:opacity-30"
            style={{ backgroundColor: NEON, boxShadow: '0 0 16px rgba(212,255,0,0.25)' }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#1a0f2e" />
            ) : (
              <Text className="text-[#1a0f2e] text-base font-sans-semibold">Go Live</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* ── Private party ── */}
      {step === 'party' ? (
        <View className="gap-4">
          <Text className="text-white text-lg font-sans-semibold">Private Party</Text>
          {gpsError ? <Text className="text-amber-400/90 text-xs font-sans">{gpsError}</Text> : null}

          <View className="gap-2">
            <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
              Neighborhood
            </Text>
            {detectingHood ? (
              <View className="flex-row items-center gap-2 py-2">
                <ActivityIndicator size="small" color={NEON} />
                <Text className="text-white/50 text-sm font-sans">Detecting...</Text>
              </View>
            ) : neighborhood && !showHoodPicker ? (
              <View className="flex-row items-center gap-2">
                <View className="rounded-xl px-4 py-2.5 bg-[#a855f7]/20 border border-[#a855f7]/40">
                  <Text className="text-[#d4ff00] text-sm font-sans-semibold">{neighborhood}</Text>
                </View>
                <Pressable onPress={() => setShowHoodPicker(true)} hitSlop={6}>
                  <Text className="text-white/50 text-sm font-sans underline">Change</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 180 }}>
                <View className="flex-row flex-wrap gap-2">
                  {(CITY_NEIGHBORHOODS[city ?? 'nyc'] ?? []).map((hood) => (
                    <Pressable
                      key={hood}
                      onPress={() => {
                        setNeighborhood(hood);
                        setShowHoodPicker(false);
                      }}
                      className={`px-3 py-2 rounded-xl border ${
                        neighborhood === hood
                          ? 'bg-[#a855f7]/25 border-[#a855f7]/40'
                          : 'bg-[#2d1b4e]/50 border-transparent'
                      }`}
                    >
                      <Text
                        className={`text-xs font-sans ${
                          neighborhood === hood ? 'text-[#d4ff00]' : 'text-white/70'
                        }`}
                      >
                        {hood}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <AudiencePicker value={audience} onChange={setAudience} />
          <Text className="text-white/40 text-xs font-sans">
            Close and direct friends see your exact spot. Mutuals only see the neighborhood — no
            map pin.
          </Text>

          <Pressable
            onPress={confirmParty}
            disabled={submitting || !neighborhood}
            className="rounded-full py-3.5 items-center active:opacity-90 disabled:opacity-30"
            style={{ backgroundColor: NEON }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#1a0f2e" />
            ) : (
              <Text className="text-[#1a0f2e] text-base font-sans-semibold">Start the Party</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* ── Planning ── */}
      {step === 'planning' ? (
        <View className="gap-4">
          <Text className="text-white text-lg font-sans-semibold">Planning tonight</Text>

          <View className="gap-2">
            <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
              Neighborhood
            </Text>
            {detectingHood ? (
              <View className="flex-row items-center gap-2 py-2">
                <ActivityIndicator size="small" color={NEON} />
                <Text className="text-white/50 text-sm font-sans">Detecting...</Text>
              </View>
            ) : neighborhood && !showHoodPicker ? (
              <View className="flex-row items-center gap-2">
                <View className="rounded-xl px-4 py-2.5 bg-[#a855f7]/20 border border-[#a855f7]/40">
                  <Text className="text-[#d4ff00] text-sm font-sans-semibold">{neighborhood}</Text>
                </View>
                <Pressable onPress={() => setShowHoodPicker(true)} hitSlop={6}>
                  <Text className="text-white/50 text-sm font-sans underline">Change</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 180 }}>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => {
                      setNeighborhood(null);
                      setShowHoodPicker(false);
                    }}
                    className={`px-3 py-2 rounded-xl border ${
                      neighborhood === null
                        ? 'bg-[#a855f7]/25 border-[#a855f7]/40'
                        : 'bg-[#2d1b4e]/50 border-transparent'
                    }`}
                  >
                    <Text className="text-white/70 text-xs font-sans">
                      Anywhere in {getCityLabel(city ?? 'nyc')}
                    </Text>
                  </Pressable>
                  {(CITY_NEIGHBORHOODS[city ?? 'nyc'] ?? []).map((hood) => (
                    <Pressable
                      key={hood}
                      onPress={() => {
                        setNeighborhood(hood);
                        setShowHoodPicker(false);
                      }}
                      className={`px-3 py-2 rounded-xl border ${
                        neighborhood === hood
                          ? 'bg-[#a855f7]/25 border-[#a855f7]/40'
                          : 'bg-[#2d1b4e]/50 border-transparent'
                      }`}
                    >
                      <Text
                        className={`text-xs font-sans ${
                          neighborhood === hood ? 'text-[#d4ff00]' : 'text-white/70'
                        }`}
                      >
                        {hood}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <AudiencePicker value={audience} onChange={setAudience} />

          <Pressable
            onPress={confirmPlanning}
            disabled={submitting}
            className="rounded-full py-3.5 items-center active:opacity-90 disabled:opacity-30"
            style={{ backgroundColor: NEON }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#1a0f2e" />
            ) : (
              <Text className="text-[#1a0f2e] text-base font-sans-semibold">
                I&apos;m Planning Tonight
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
