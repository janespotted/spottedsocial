import DateTimePicker from '@react-native-community/datetimepicker';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useNavigation } from 'expo-router';
import { useNightMode } from '@/hooks/use-night-mode';
import { getNightKey } from '@/lib/tonight';
import { ErrorState, EmptyState } from './empty-state';
import { friendCardPress } from '@/lib/friend-card';
import { dismissKeyboardNow } from '@/hooks/use-dismiss-keyboard-on-leave';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { PLAN_TYPES } from '@/lib/plans';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { RESET_COPY } from '@/lib/reset-copy';
import { NEON } from '@/lib/theme';

export interface PlanVenue {
  id: string;
  name: string;
  neighborhood: string;
}

export interface PlanFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
  username: string;
}

export interface PlanFormValues {
  venue: PlanVenue;
  planDate: string;
  planTime: string;
  planType: string | null;
  description: string;
  visibility: 'friends' | 'close_friends';
  friends: PlanFriend[];
}

interface PlanFormProps {
  title: string;
  submitLabel: string;
  submittingLabel: string;
  initial?: Omit<Partial<PlanFormValues>, 'venue'> & { venue?: PlanVenue | null };
  onSubmit: (values: PlanFormValues) => Promise<void>;
}

/** Next 7 days, matching the web dialogs' date <select>. */
function buildDateOptions(city: string) {
  const key = getNightKey(new Date(), city);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
    return { value: date.toISOString().slice(0,10), label: i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) };
  });
}

/** Half-hour slots starting at 4 PM, wrapping the clock — same as web. */
function buildTimeOptions() {
  return Array.from({ length: 24 }, (_, i) => {
    const hour24 = (i + 16) % 24;
    const hour12 = hour24 % 12 || 12;
    const ampm = hour24 < 12 ? 'AM' : 'PM';
    return [
      { value: `${String(hour24).padStart(2, '0')}:00`, label: `${hour12}:00 ${ampm}` },
      { value: `${String(hour24).padStart(2, '0')}:30`, label: `${hour12}:30 ${ampm}` },
    ];
  }).flat();
}

function pickFromSheet(
  title: string,
  options: { value: string | null; label: string }[],
  onPick: (value: string | null) => void
) {
  ActionSheetIOS.showActionSheetWithOptions(
    { title, options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
    (index) => {
      if (index < options.length) onPick(options[index].value);
    }
  );
}

/** Field row that opens an ActionSheet picker — the native stand-in for the web <select>. */
function PickerRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-1 min-w-0">
      <Text className="text-white/55 text-xs font-sans mb-1.5">{label}</Text>
      <Pressable
        onPress={onPress}
        className="min-h-11 px-3 rounded-xl bg-[#1a1230] border border-white/10 flex-row items-center justify-between active:opacity-70"
      >
        <Text className="text-white text-sm font-sans" numberOfLines={1}>
          {value}
        </Text>
        <SymbolView name="chevron.up.chevron.down" size={12} tintColor="rgba(255,255,255,0.4)" />
      </Pressable>
    </View>
  );
}

/**
 * Shared create/edit plan form — port of the web CreatePlanDialog /
 * EditPlanDialog pair: venue search first, then details once one is picked.
 */
export function PlanForm({ title, submitLabel, submittingLabel, initial, onSubmit }: PlanFormProps) {
  const { session } = useSession();
  const friendIdsQuery = useFriendIds(session?.user.id);
  const friendIds = friendIdsQuery.data;

  const { city: profileCity } = useNightMode();
  const dateOptions = useMemo(() => buildDateOptions(profileCity), [profileCity]);
  const timeOptions = useMemo(buildTimeOptions, []);

  const [selectedVenue, setSelectedVenue] = useState<PlanVenue | null>(initial?.venue ?? null);
  const [venueSearch, setVenueSearch] = useState('');
  const [planDate, setPlanDate] = useState(initial?.planDate ?? dateOptions[0].value);
  const [planTime, setPlanTime] = useState(initial?.planTime ?? '21:00');
  const [planType, setPlanType] = useState<string | null>(initial?.planType ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState<'friends' | 'close_friends'>(
    initial?.visibility ?? 'friends'
  );
  const [selectedFriends, setSelectedFriends] = useState<PlanFriend[]>(initial?.friends ?? []);
  const [friendSearch, setFriendSearch] = useState('');
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [saved, setSaved] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!!initial?.description || !!initial?.planType);
  const [submitError, setSubmitError] = useState(false);
  const navigation = useNavigation();
  const dirty = (selectedVenue?.id ?? null) !== (initial?.venue?.id ?? null)
    || planDate !== (initial?.planDate ?? dateOptions[0].value) || planTime !== (initial?.planTime ?? '21:00')
    || description !== (initial?.description ?? '') || planType !== (initial?.planType ?? null)
    || visibility !== (initial?.visibility ?? 'friends')
    || selectedFriends.map(f => f.id).sort().join() !== (initial?.friends ?? []).map(f => f.id).sort().join();
  usePreventRemove(!saved && (dirty || isSubmitting), ({ data }) => {
    if (submissionLock.current) return;
    Alert.alert('Discard this plan?', 'Your changes haven’t been shared.', [
    { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => router.canGoBack() ? router.back() : router.replace('/messages?tab=plans'), 0);
    return () => clearTimeout(timer);
  }, [saved]);

  const cityQuery = useQuery({
    queryKey: ['home-city', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', session!.user.id)
        .maybeSingle<{ city: string | null }>();
      if (error) throw error;
      if (!data?.city) throw new Error('City unavailable');
      return data.city;
    },
  });

  const city = cityQuery.data;
  const venuesQuery = useQuery({
    queryKey: ['plan-venues', city],
    enabled: !!city,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlanVenue[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, neighborhood')
        .eq('city', city!)
        .order('popularity_rank');
      if (error) throw error;
      return data ?? [];
    },
  });
  const venues = venuesQuery.data ?? [];

  const friendsQuery = useQuery({
    queryKey: ['plan-friends', session?.user.id, friendIds],
    enabled: !!session && !!friendIds,
    staleTime: 60_000,
    queryFn: async (): Promise<PlanFriend[]> => {
      if (!friendIds?.length) return [];
      const profiles = await fetchProfilesSafe();
      return profiles
        .filter((p) => friendIds.includes(p.id))
        .map((p) => ({
          id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          username: p.username,
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });

  const friends = friendsQuery.data ?? [];
  const closeQuery = useQuery({
    queryKey: ['plan-close-friends', session?.user.id], enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('close_friends').select('close_friend_id').eq('user_id', session!.user.id);
      if (error) throw error;
      return (data ?? []).map(f => f.close_friend_id);
    },
  });
  const closeIds = closeQuery.data;
  const friendLoading = friendIdsQuery.isLoading || friendsQuery.isLoading || (visibility === 'close_friends' && closeQuery.isLoading);
  const friendFailed = friendIdsQuery.isError || friendsQuery.isError || (visibility === 'close_friends' && closeQuery.isError);
  const eligibleFriends = friends.filter(f => visibility === 'friends' || closeIds?.includes(f.id));
  useEffect(() => {
    if (!friendIds || (visibility === 'close_friends' && !closeIds)) return;
    setSelectedFriends(previous => previous.filter(f => friendIds.includes(f.id) &&
      (visibility === 'friends' || closeIds!.includes(f.id))));
  }, [visibility, friendIds, closeIds]);

  const filteredVenues = venues.filter(
    (v) =>
      v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
      (v.neighborhood ?? '').toLowerCase().includes(venueSearch.toLowerCase())
  );
  const filteredFriends = eligibleFriends.filter(
    (f) =>
      f.display_name.toLowerCase().includes(friendSearch.toLowerCase()) ||
      f.username.toLowerCase().includes(friendSearch.toLowerCase())
  );

  const toggleFriend = (friend: PlanFriend) => {
    setSelectedFriends((prev) =>
      prev.some((f) => f.id === friend.id)
        ? prev.filter((f) => f.id !== friend.id)
        : [...prev, friend]
    );
  };

  const handleSubmit = async () => {
    if (!selectedVenue || submissionLock.current || saved) return;
    submissionLock.current = true;
    Keyboard.dismiss();
    setIsSubmitting(true);
    setSubmitError(false);
    try {
      await onSubmit({
        venue: selectedVenue,
        planDate,
        planTime,
        planType,
        description,
        visibility,
        friends: selectedFriends,
      });
      setSaved(true);
    } catch { setSubmitError(true); } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const dateLabel = dateOptions.find((o) => o.value === planDate)?.label ?? planDate;
  const timeLabel = timeOptions.find((o) => o.value === planTime)?.label ?? planTime;
  const typeLabel = planType
    ? (PLAN_TYPES.find((t) => t.value === planType)?.label ?? planType)
    : 'Just a plan';

  return (
    <View className="flex-1 bg-[#110a24]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 min-h-12 mt-2">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close plan" disabled={isSubmitting} className="min-h-11 min-w-11 items-center justify-center opacity-60">
          <SymbolView name="chevron.down" size={20} tintColor="#ffffff" />
        </Pressable>
        <Text className="text-white font-sans-semibold text-base">{title}</Text>
        <View className="w-7" />
      </View>

      <KeyboardAwareScrollView
        testID="plan-form-scroll"
        className="flex-1"
        contentContainerClassName="px-5 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={dismissKeyboardNow}
      >
        {/* Pressable wrapper so taps on empty space close the friend dropdown;
            interactive children claim their own touches first */}
        <Pressable
          accessible={false}
          pointerEvents={isSubmitting ? 'none' : 'auto'}
          onPress={() => {
            if (showFriendPicker) {
              setShowFriendPicker(false);
              Keyboard.dismiss();
            }
          }}
        >
        {/* Step 1: venue */}
        {selectedVenue ? (
          <Pressable
            onPress={() => setSelectedVenue(null)}
            className="flex-row items-center gap-3 py-3 active:opacity-70"
          >
            <View className="w-10 h-10 rounded-full bg-[#d4ff00]/10 items-center justify-center">
              <SymbolView name="mappin" size={18} tintColor={NEON} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-sans-medium">{selectedVenue.name}</Text>
              {selectedVenue.neighborhood ? (
                <Text className="text-white/55 text-xs font-sans">
                  {selectedVenue.neighborhood}
                </Text>
              ) : null}
            </View>
            <SymbolView name="xmark" size={14} tintColor="rgba(255,255,255,0.3)" />
          </Pressable>
        ) : (
          <>
            <View className="flex-row items-center min-h-12 px-3.5 rounded-2xl bg-[#1a1230] border border-white/10">
              <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.25)" />
              <TextInput
                editable={!isSubmitting}
                placeholder="Where are you going?"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={venueSearch}
                onChangeText={setVenueSearch}
                accessibilityLabel="Search venues"
                className="flex-1 ml-2.5 text-white text-[15px] font-sans"
              />
              {venueSearch ? <Pressable accessibilityRole="button" accessibilityLabel="Clear venue search" onPress={() => setVenueSearch('')} className="min-h-11 min-w-11 items-center justify-center"><SymbolView name="xmark" size={14} tintColor="white" /></Pressable> : null}
            </View>
            <View className="mt-2" testID="plan-venue-results">
              {cityQuery.isLoading || venuesQuery.isLoading ? <Text className="text-white/60 py-6">Loading spots…</Text> : cityQuery.isError || venuesQuery.isError ? <ErrorState compact title="Couldn’t load spots" onRetry={() => { void cityQuery.refetch(); void venuesQuery.refetch(); }} /> : !filteredVenues.length ? <EmptyState compact icon="magnifyingglass" title="No spots found" body="Try another name or neighborhood." /> : null}
              {filteredVenues.map((venue) => (
                <Pressable
                  key={venue.id}
                  onPress={() => {
                    setSelectedVenue(venue);
                    setVenueSearch('');
                  }}
                  className="py-3 px-1 rounded-xl active:bg-white/5"
                >
                  <Text className="text-white text-[15px] font-sans">{venue.name}</Text>
                  <Text className="text-white/50 text-xs font-sans">{venue.neighborhood}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Step 2: details */}
        {selectedVenue ? (
          <View className="gap-5 mt-4">
            <View className="flex-row gap-3">
              <PickerRow
                label="When"
                value={dateLabel}
                onPress={() =>
                  pickFromSheet('When', dateOptions, (v) => v !== null && setPlanDate(v))
                }
              />
              <PickerRow
                label="Time"
                value={timeLabel}
                onPress={() =>
                  setShowTime(v => !v)
                }
              />
            </View>

            {showTime ? <View className="rounded-2xl bg-white/5 p-2"><DateTimePicker mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} themeVariant="dark" minuteInterval={30}
              value={new Date(2026, 0, 1, Number(planTime.split(':')[0]), Number(planTime.split(':')[1]))}
              onChange={(event, date) => { if (Platform.OS !== 'ios') setShowTime(false); if (event.type !== 'dismissed' && date) setPlanTime(`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`); }} />
              <Pressable accessibilityRole="button" onPress={() => setShowTime(false)} className="min-h-11 items-center justify-center"><Text className="text-[#d4ff00] text-sm">Done · {profileCity === 'la' ? 'Los Angeles' : 'New York'} time</Text></Pressable></View> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(v => !v)} className="min-h-11 justify-center"><Text className="text-white/65 text-sm font-sans">{detailsOpen ? 'Hide details −' : 'Add a note or type +'}</Text></Pressable>
            {detailsOpen ? <View className="gap-4"><PickerRow
              label="Type"
              value={typeLabel}
              onPress={() =>
                pickFromSheet(
                  'Type',
                  [
                    { value: null, label: 'Just a plan' },
                    ...PLAN_TYPES.map((t) => ({ value: t.value, label: `${t.emoji} ${t.label}` })),
                  ],
                  setPlanType
                )
              }
            />

            <View>
              <Text className="text-white/55 text-xs font-sans mb-1.5">Note</Text>
              <TextInput
                editable={!isSubmitting}
                placeholder="What's the plan?"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={description}
                onChangeText={setDescription}
                maxLength={280}
                multiline
                className="bg-[#1a1230] border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm font-sans min-h-16"
                style={{ textAlignVertical: 'top' }}
              />
            </View>

            </View> : null}
            {/* Invite friends */}
            <View>
              <Text className="text-white/55 text-xs font-sans mb-1.5">Invite friends</Text>

              {selectedFriends.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {selectedFriends.map((friend) => (
                    <Pressable
                      key={friend.id}
                      onPress={() => toggleFriend(friend)}
                      className="flex-row items-center gap-1.5 bg-[#1a1230] border border-white/10 rounded-full pl-1 pr-2.5 py-1 active:opacity-70"
                    >
                      <Avatar userId={friend.id} name={friend.display_name} url={friend.avatar_url} size="sm" />
                      <Text className="text-white text-xs font-sans" onPress={friendCardPress(friend.id)} accessibilityRole="button">
                        {friend.display_name.split(' ')[0]}
                      </Text>
                      <SymbolView name="xmark" size={10} tintColor="rgba(255,255,255,0.3)" />
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View className="flex-row items-center min-h-11 px-3.5 rounded-xl bg-[#1a1230] border border-white/10">
                <SymbolView name="magnifyingglass" size={14} tintColor="rgba(255,255,255,0.25)" />
                <TextInput
                editable={!isSubmitting}
                  placeholder="Search friends..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={friendSearch}
                  onChangeText={(t) => {
                    setFriendSearch(t);
                    setShowFriendPicker(true);
                  }}
                  onFocus={() => setShowFriendPicker(true)}
                  className="flex-1 ml-2.5 text-white text-sm font-sans"
                />
              </View>

              {showFriendPicker && friendFailed ? <ErrorState compact title="Couldn’t load friends" onRetry={() => { void friendIdsQuery.refetch(); void friendsQuery.refetch(); void closeQuery.refetch(); }} /> : showFriendPicker && friendLoading ? <Text className="text-white/60 py-3">Loading friends…</Text> : showFriendPicker && !filteredFriends.length ? <Text className="text-white/60 py-3">{friendSearch ? 'No matching friends.' : 'No friends in this audience yet.'}</Text> : null}
              {showFriendPicker && !friendFailed && !friendLoading && filteredFriends.length > 0 ? (
                <View className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                  {filteredFriends.slice(0, 6).map((friend) => {
                    const isSelected = selectedFriends.some((f) => f.id === friend.id);
                    return (
                      <Pressable
                        key={friend.id}
                        onPress={() => {
                          toggleFriend(friend);
                          setFriendSearch('');
                          setShowFriendPicker(false);
                          Keyboard.dismiss();
                        }}
                        className="flex-row items-center gap-3 p-2.5 active:bg-white/5"
                      >
                        <Avatar userId={friend.id} name={friend.display_name} url={friend.avatar_url} size="sm" />
                        <View className="flex-1 min-w-0">
                          <Text className="text-white text-sm font-sans" numberOfLines={1} onPress={friendCardPress(friend.id)} accessibilityRole="button">
                            {friend.display_name}
                          </Text>
                          <Text className="text-white/45 text-xs font-sans" numberOfLines={1}>
                            @{friend.username}
                          </Text>
                        </View>
                        {isSelected ? (
                          <SymbolView name="checkmark" size={14} tintColor={NEON} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* Visibility */}
            <View>
              <Text className="text-white/55 text-xs font-sans mb-1.5">Who can see this</Text>
              <View className="flex-row gap-2">
                {(
                  [
                    { value: 'friends', label: 'Friends' },
                    { value: 'close_friends', label: 'Close Friends' },
                  ] as const
                ).map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setVisibility(opt.value)}
                    className={`flex-1 py-2 rounded-full items-center ${
                      visibility === opt.value
                        ? 'bg-[#d4ff00]'
                        : 'bg-[#1a1230] border border-white/10'
                    }`}
                  >
                    <Text
                      className={`text-xs font-sans-medium ${
                        visibility === opt.value ? 'text-black' : 'text-white/50'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {submitError ? <Text accessibilityRole="alert" className="text-red-300 text-sm font-sans">Couldn’t save. Your draft is still here — try again.</Text> : null}
            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              className={`min-h-12 rounded-2xl items-center justify-center mt-2 ${
                isSubmitting ? 'opacity-40' : 'active:opacity-90'
              }`}
              style={{ backgroundColor: NEON }}
            >
              <Text className="text-black font-sans-semibold text-base">
                {isSubmitting ? submittingLabel : submitLabel}
              </Text>
            </Pressable>
            <Text className="text-white/45 text-xs font-sans text-center mt-2">
              {RESET_COPY.planCompose}
            </Text>
          </View>
        ) : null}
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}
