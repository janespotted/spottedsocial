import { withholdLivePreview } from '@/lib/live-preview';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { getNightKey } from '@/lib/tonight';
import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from '@/components/styled';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery as useCachedQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe, type SafeProfile } from '@/lib/profiles';
import { isDemoMode } from '@/lib/demo-mode';
import { reportContent } from '@/lib/moderation';
import { getHoursDisplayString, type VenueHours, type VenueHoursDisplay } from '@/lib/venue-hours';
import { calculateDistanceMiles, getVenuePhotoUrl, getVenueTypeDisplay } from '@/lib/venues';
import { sendVenueInvites, type InviteFriend } from '@/lib/venue-invites';
import { APP_BASE_URL, fetchOrCreateInviteCode, getInviteUrl } from '@/lib/invites';
import { NEON, control, outlineControl } from '@/lib/theme';
import { RESET_COPY } from '@/lib/reset-copy';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useFriendsOut } from '@/hooks/use-friends-out';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { VenueEventsSection } from '@/components/venue-events-section';

interface VenueData {
  id: string;
  name: string;
  neighborhood: string | null;
  city: string | null;
  type: string | null;
  lat: number;
  lng: number;
  is_map_promoted: boolean | null;
  google_photo_refs: string[] | null;
  google_rating: number | null;
  google_user_ratings_total: number | null;
  operating_hours: VenueHours | null;
}

interface FriendAtVenue {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface SimilarVenue {
  id: string;
  name: string;
  neighborhood: string | null;
}

interface VenueCardData {
  venue: VenueData;
  isInWishlist: boolean;
  distance: string | null;
  friendsAtVenue: FriendAtVenue[];
  friendsPlanning: FriendAtVenue[];
  similarVenues: SimilarVenue[];
}

function uniquePeople(profiles: SafeProfile[]): SafeProfile[] {
  return [...new Map(profiles.map(p => [p.id, p])).values()];
}

function toFriend(p: SafeProfile): FriendAtVenue {
  return { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url };
}

/** Names as a sentence: "Ava, Ben and 2 others". */
function namesLine(friends: FriendAtVenue[]): string {
  const names = friends.map((f) => f.display_name.split(' ')[0]);
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/**
 * Who's here — the headline of the card when friends are present (client
 * feedback §7): big avatar stack, count as the title, names underneath,
 * tap to expand the full list.
 */
function WhosHere({ friends, planning }: { friends: FriendAtVenue[]; planning: FriendAtVenue[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = friends.slice(0, 5);
  const remaining = friends.length - visible.length;
  const count = friends.length;
  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${count} friends here: ${namesLine(friends)}`}
      className="rounded-2xl px-4 py-3.5 gap-2.5 active:opacity-90"
      style={{ backgroundColor: 'rgba(212,255,0,0.08)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)' }}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-row -space-x-3">
          {visible.map((friend) => (
            <View key={friend.id} className="rounded-full border-2 border-[#0d0a18]">
              <Avatar name={friend.display_name} url={friend.avatar_url} size="md" />
            </View>
          ))}
          {remaining > 0 ? (
            <View className="w-10 h-10 rounded-full bg-[#a855f7]/40 border-2 border-[#0d0a18] items-center justify-center">
              <Text className="text-white text-xs font-sans-semibold">+{remaining}</Text>
            </View>
          ) : null}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-white text-base font-sans-semibold">
            {count} {count === 1 ? 'friend is' : 'friends are'} here
          </Text>
          <Text className="text-white/60 text-xs font-sans" numberOfLines={expanded ? undefined : 1}>
            {namesLine(friends)}
          </Text>
        </View>
        <SymbolView name={expanded ? 'chevron.up' : 'chevron.down'} size={12} tintColor="rgba(255,255,255,0.4)" />
      </View>
      {expanded ? (
        <View className="gap-1.5 pt-1 border-t border-white/10">
          {friends.map((friend) => (
            <View key={friend.id} className="flex-row items-center gap-2 pt-1.5">
              <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
              <Text className="text-white text-sm font-sans">{friend.display_name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {planning.length > 0 ? (
        <Text className="text-white/55 text-xs font-sans">
          {planning.length} more {planning.length === 1 ? 'is' : 'are'} planning to come.
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Secondary "planning" row when nobody is here yet. */
function PlanningRow({ friends }: { friends: FriendAtVenue[] }) {
  const visible = friends.slice(0, 4);
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-row -space-x-2">
        {visible.map((friend) => (
          <Avatar key={friend.id} name={friend.display_name} url={friend.avatar_url} size="sm" />
        ))}
      </View>
      <Text className="text-sm text-white/60 font-sans">
        {friends.length} {friends.length === 1 ? 'friend is' : 'friends are'} planning to come
      </Text>
    </View>
  );
}

/** Full port of the web VenueIdCard, presented as a modal route. */
export default function VenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { session } = useSession();
  const { data: ownNight } = useOwnNightStatus();
  const withheld = withholdLivePreview(ownNight?.status?.status, !!ownNight);
  const { data: friendIds } = useFriendIds(session?.user.id);
  const queryClient = useQueryClient();
  const { height: windowHeight } = useWindowDimensions();
  // Open by default: hours, events and Trending Nearby are the reason to
  // open a venue, and the sheet sizes to its content either way.
  const [moreInfoOpen, setMoreInfoOpen] = useState(true);
  // Keyed by venueId so Trending Nearby swaps retry the new venue's photo
  const [photoFailedFor, setPhotoFailedFor] = useState<string | null>(null);
  const photoFailed = photoFailedFor === venueId;
  const [wishlistOverride, setWishlistOverride] = useState<boolean | null>(null);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);

  // Relationships are part of the key so an old eligible guest list is never reused.
  const { data: rawData, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['venue-card', venueId, session?.user.id, friendIds],
    enabled: !!venueId && !!session && friendIds !== undefined,
    retry: 1,
    queryFn: async (): Promise<VenueCardData | null> => {
      const nowIso = new Date().toISOString();
      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .select('*')
        .eq('id', venueId!)
        .maybeSingle();
      if (venueError) throw venueError;
      if (!venue) return null;

      const [
        { data: wishlistEntry },
        { data: statuses, error: statusError },
        { data: venuePlans, error: plansError },
        profiles,
      ] = await Promise.all([
        supabase
          .from('wishlist_places')
          .select('id')
          .eq('user_id', session!.user.id)
          .eq('venue_name', venue.name)
          .maybeSingle(),
        supabase
          .from('night_statuses')
          .select('user_id')
          .eq('venue_name', venue.name)
          .not('expires_at', 'is', null)
          .gt('expires_at', nowIso),
        supabase
          .from('plans')
          .select('id, user_id')
          .eq('venue_id', venueId!)
          .eq('plan_date', getNightKey())
          .gt('expires_at', nowIso),
        fetchProfilesSafe(),
      ]);

      if (statusError || plansError) throw statusError ?? plansError;
      const myProfile = profiles.find(p => p.id === session!.user.id);
      const profileMap = buildProfileMap(profiles);
      const friendSet = new Set(friendIds ?? []);

      // Friends here now — dedupe by user ID
      const friendsAtVenue = uniquePeople((statuses ?? [])
        .map(s => s.user_id)
        .filter(id => friendSet.has(id) && profileMap.has(id))
        .map(id => profileMap.get(id)!)).map(toFriend);

      // Friends planning: plan creators + "I'm down" + participants, today
      let friendsPlanning: FriendAtVenue[] = [];
      if (venuePlans?.length) {
        const planIds = venuePlans.map((p) => p.id);
        const [{ data: downs, error: downsError }, { data: participants, error: participantsError }] = await Promise.all([
          supabase.from('plan_downs').select('user_id').in('plan_id', planIds),
          supabase.from('plan_participants').select('user_id').in('plan_id', planIds),
        ]);
        if (downsError || participantsError) throw downsError ?? participantsError;
        const atVenueIds = new Set(friendsAtVenue.map((f) => f.id));
        const interested = [
          ...new Set([
            ...venuePlans.map((p) => p.user_id),
            ...(downs ?? []).map((d) => d.user_id),
            ...(participants ?? []).map((p) => p.user_id),
          ]),
        ].filter(
          (id) =>
            id !== session!.user.id &&
            friendSet.has(id) &&
            !atVenueIds.has(id) &&
            profileMap.has(id) &&
            (isDemoMode() || !profileMap.get(id)!.is_demo)
        );
        friendsPlanning = interested.map((id) => toFriend(profileMap.get(id)!));
      }

      // Distance from last known location
      let distance: string | null = null;
      if (myProfile?.last_known_lat && myProfile?.last_known_lng) {
        distance = calculateDistanceMiles(
          myProfile.last_known_lat,
          myProfile.last_known_lng,
          venue.lat,
          venue.lng
        );
      }

      // Trending nearby: same neighborhood, fall back to same city
      let { data: similar } = await supabase
        .from('venues')
        .select('id, name, neighborhood')
        .eq('neighborhood', venue.neighborhood ?? '')
        .eq('city', venue.city ?? '')
        .neq('id', venueId!)
        .order('popularity_rank', { ascending: true })
        .limit(4);
      if (!similar || similar.length < 3) {
        const { data: cityVenues } = await supabase
          .from('venues')
          .select('id, name, neighborhood')
          .eq('city', venue.city ?? '')
          .neq('id', venueId!)
          .order('popularity_rank', { ascending: true })
          .limit(4);
        similar = cityVenues ?? [];
      }

      return {
        venue: venue as VenueData,
        isInWishlist: !!wishlistEntry,
        distance,
        friendsAtVenue,
        friendsPlanning,
        similarVenues: (similar ?? []) as SimilarVenue[],
      };
    },
  });

  // Hours + photos + rating: live edge function with cached-columns fallback
  const data = rawData && withheld ? { ...rawData, friendsAtVenue: [] } : rawData;

  const { data: hoursData } = useCachedQuery({
    queryKey: ['venue-hours', venueId],
    enabled: !!venueId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{
      hours: VenueHoursDisplay | null;
      photoCount: number;
      rating: number | null;
      ratingsCount: number;
    }> => {
      const fromCached = (v: VenueData | undefined) => ({
        hours: v?.operating_hours ? getHoursDisplayString(v.operating_hours) : null,
        photoCount: v?.google_photo_refs?.length ?? 0,
        rating: v?.google_rating ?? null,
        ratingsCount: v?.google_user_ratings_total ?? 0,
      });
      try {
        const { data: live, error } = await supabase.functions.invoke('get-venue-hours', {
          body: { venueId },
        });
        if (error || !live) throw error;
        return {
          hours: live.operating_hours
            ? getHoursDisplayString(live.operating_hours as VenueHours)
            : null,
          photoCount: Array.isArray(live.google_photo_refs) ? live.google_photo_refs.length : 0,
          rating: live.google_rating ?? null,
          ratingsCount: live.google_user_ratings_total ?? 0,
        };
      } catch {
        const { data: cached } = await supabase
          .from('venues')
          .select('google_photo_refs, google_rating, google_user_ratings_total, operating_hours')
          .eq('id', venueId!)
          .single();
        return fromCached(cached as VenueData | undefined);
      }
    },
  });

  const venue = data?.venue;
  const isInWishlist = wishlistOverride ?? data?.isInWishlist ?? false;

  // Optimistic, and rolled back if the write fails (it never was before)
  const toggleWishlist = async () => {
    if (!venue || !session) return;
    const wasSaved = isInWishlist;
    setWishlistOverride(!wasSaved);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = wasSaved
      ? await supabase
          .from('wishlist_places')
          .delete()
          .eq('user_id', session.user.id)
          .eq('venue_name', venue.name)
      : await supabase
          .from('wishlist_places')
          .insert({ user_id: session.user.id, venue_name: venue.name, venue_image_url: null });
    if (error) {
      setWishlistOverride(wasSaved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(wasSaved ? "Couldn't remove from saved" : "Couldn't save this spot", 'Please try again.');
      return;
    }
    if (!wasSaved) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    queryClient.invalidateQueries({ queryKey: ['profile-page'] });
  };

  const openDirections = () => {
    if (!venue) return;
    Linking.openURL(`maps://?daddr=${venue.lat},${venue.lng}`).catch(() =>
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`
      )
    );
  };

  // Share carries the user's invite link so a friend who isn't on Spotted
  // yet lands somewhere useful (there is no public venue page)
  const shareVenue = async () => {
    if (!venue) return;
    let url = APP_BASE_URL;
    if (session) {
      const invite = await fetchOrCreateInviteCode(session.user.id).catch(() => null);
      if (invite) url = getInviteUrl(invite.code);
    }
    Share.share({
      message: `Check out ${venue.name}${venue.neighborhood ? ` in ${venue.neighborhood}` : ''} on Spotted 🎉 ${url}`,
    });
  };

  const openMenu = () => {
    if (!venue || !session) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Report Venue', 'Cancel'], cancelButtonIndex: 1 },
      (index) => {
        if (index === 0) reportContent(session.user.id, { type: 'venue', id: venue.id });
      }
    );
  };

  // Invite picker data: my friends (demo visible only in dev via fetchProfilesSafe)
  const { data: allProfiles } = useQuery({
    queryKey: ['profiles-safe-all'],
    staleTime: 60_000,
    queryFn: fetchProfilesSafe,
  });
  const inviteFriends: InviteFriend[] = (friendIds ?? [])
    .map((id) => allProfiles?.find((p) => p.id === id))
    .filter((p): p is SafeProfile => !!p)
    .map((p) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));

  // Grouped like the original InviteFriendsModal (addendum v3 §11.6):
  // Friends Out Now (with their venue), TBD Tonight (with their plan),
  // Staying in. A viewer who is in tonight sees names but not venues.
  const { data: friendsOut } = useFriendsOut();
  const inviteGroups = (() => {
    const outRows = (friendsOut?.outFriends ?? []).map((f) => ({
      id: f.user_id,
      display_name: f.display_name,
      avatar_url: f.avatar_url,
      line: friendsOut?.venuesWithheld ? 'Out tonight' : f.venue_name ? `At ${f.venue_name}` : 'Out tonight',
      lineColor: NEON,
    }));
    const tbdRows = (friendsOut?.planningFriends ?? []).map((f) => ({
      id: f.user_id,
      display_name: f.display_name,
      avatar_url: f.avatar_url,
      line: f.planning_venue_name
        ? `thinking ${f.planning_venue_name}`
        : f.planning_neighborhood
          ? `TBD · ${f.planning_neighborhood}`
          : 'TBD · down for anything',
      lineColor: 'rgba(255,255,255,0.55)',
    }));
    const taken = new Set([...outRows, ...tbdRows].map((r) => r.id));
    const homeRows = inviteFriends
      .filter((f) => !taken.has(f.id))
      .map((f) => ({ ...f, line: 'Home', lineColor: 'rgba(255,255,255,0.4)' }));
    return [
      { key: 'out', title: 'Friends Out Now', icon: 'flame.fill' as const, rows: outRows },
      { key: 'tbd', title: 'TBD Tonight', icon: 'target' as const, rows: tbdRows },
      { key: 'home', title: 'Staying in', icon: 'house.fill' as const, rows: homeRows },
    ].filter((g) => g.rows.length > 0);
  })();
  const inviteRowsById = new Map(inviteGroups.flatMap((g) => g.rows).map((r) => [r.id, r]));

  // Sent → close the sheet and show the "Invites Sent!" card (confetti,
  // Undo, Chat) — the original build's success state (addendum v3 §1).
  const submitInvites = async () => {
    if (!venue || !session || sendingInvites) return;
    const selected = [...selectedInvitees]
      .map((id) => inviteRowsById.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ id: r.id, display_name: r.display_name, avatar_url: r.avatar_url }));
    if (selected.length === 0) return;
    setSendingInvites(true);
    const result = await sendVenueInvites(session.user.id, venue.name, selected);
    setSendingInvites(false);
    if (!result.ok) {
      Alert.alert('Could not send invites', 'Please try again.');
      return;
    }
    setInvitePickerOpen(false);
    setSelectedInvitees(new Set());
    const delivered = selected.filter(friend => result.recipientIds.includes(friend.id));
    if (delivered.length < selected.length) Alert.alert('Some invites were not sent', 'The confirmation lists only people who could receive your invitation.');
    const friends = JSON.stringify(delivered);
    const notificationIds = JSON.stringify(result.notificationIds);
    router.back();
    setTimeout(
      () =>
        router.push({
          pathname: '/sent-confirmation',
          params: { kind: 'invites', friends, venueName: venue.name, notificationIds },
        }),
      350
    );
  };

  const typeInfo = venue?.type ? getVenueTypeDisplay(venue.type) : null;
  const distNum = data?.distance ? parseFloat(data.distance) : NaN;
  const metaParts: string[] = [];
  if (typeInfo) metaParts.push(typeInfo.label);
  if (venue?.neighborhood) metaParts.push(venue.neighborhood);
  if (!isNaN(distNum) && distNum <= 10) metaParts.push(`${data!.distance} mi`);

  const friendsHere = data?.friendsAtVenue ?? [];
  const friendsPlanning = data?.friendsPlanning ?? [];

  if (invitePickerOpen) {
    return (
      <View className="bg-[#0d0a18]" style={{ height: Math.round(windowHeight * 0.7) }}>
        <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
          <Text className="text-white text-base font-sans-semibold">
            Invite to {venue?.name ?? 'venue'}
          </Text>
          <Pressable onPress={() => setInvitePickerOpen(false)} hitSlop={12} accessibilityLabel="Close invite picker">
            <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="px-4 pt-2 pb-4 gap-4">
          {inviteGroups.length === 0 ? (
            <Text className="text-white/55 text-sm font-sans text-center py-10">
              Add some friends first.
            </Text>
          ) : (
            inviteGroups.map((group) => (
              <View key={group.key} className="gap-1">
                <View className="flex-row items-center gap-1.5 px-2 pb-1">
                  <SymbolView
                    name={group.icon}
                    size={11}
                    tintColor={group.key === 'out' ? NEON : 'rgba(255,255,255,0.5)'}
                  />
                  <Text className="text-white/55 text-[11px] font-sans-semibold uppercase tracking-wider">
                    {group.title} ({group.rows.length})
                  </Text>
                </View>
                {group.rows.map((friend) => {
                  const selected = selectedInvitees.has(friend.id);
                  return (
                    <Pressable
                      key={friend.id}
                      onPress={() =>
                        setSelectedInvitees((prev) => {
                          const next = new Set(prev);
                          if (next.has(friend.id)) next.delete(friend.id);
                          else next.add(friend.id);
                          return next;
                        })
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      className={`flex-row items-center gap-3 p-2 rounded-xl active:bg-white/5 ${
                        selected ? 'bg-[#d4ff00]/8' : ''
                      }`}
                    >
                      <View
                        className="w-5 h-5 rounded-md border items-center justify-center"
                        style={{
                          borderColor: selected ? NEON : 'rgba(255,255,255,0.3)',
                          backgroundColor: selected ? NEON : 'transparent',
                        }}
                      >
                        {selected ? <SymbolView name="checkmark" size={11} tintColor="#000000" weight="bold" /> : null}
                      </View>
                      <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
                      <View className="flex-1 min-w-0">
                        <Text className="text-white text-sm font-sans-medium" numberOfLines={1}>
                          {friend.display_name}
                        </Text>
                        <Text className="text-xs font-sans" style={{ color: friend.lineColor }} numberOfLines={1}>
                          {friend.line}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
        <View className="px-4 pb-safe-offset-4 pt-2 gap-2">
          <Text className="text-white/45 text-xs font-sans text-center">
            {RESET_COPY.inviteCompose}
          </Text>
          <Pressable
            onPress={submitInvites}
            disabled={selectedInvitees.size === 0 || sendingInvites}
            className="w-full min-h-11 rounded-xl items-center justify-center active:opacity-90 disabled:opacity-30"
            style={{ backgroundColor: NEON }}
          >
            {sendingInvites ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text className="text-black font-sans-semibold">
                Send Invite{selectedInvitees.size > 1 ? 's' : ''}
                {selectedInvitees.size > 0 ? ` (${selectedInvitees.size})` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // The sheet is sized to this content (fitToContents). A ScrollView as the
  // root child breaks that measurement on iOS — the sheet opens tall with the
  // content pinned to its bottom — so the card is a plain View and only the
  // expandable More Info section scrolls, inside a bounded height (the same
  // nested pattern the check-in sheet uses).
  return (
    <View className="bg-[#0d0a18]">
      <View className="pb-safe-offset-6">
        {/* ── ZONE 1: Identity — banner renders immediately from venueId alone,
            so the photo downloads in parallel with the data queries. On error
            (venue has no Google photos) it falls back to the gradient. ── */}
        <View className="relative">
          {!photoFailed && venueId ? (
            <Image
              source={{ uri: getVenuePhotoUrl(venueId, 0) }}
              className="w-full h-36"
              contentFit="cover"
              transition={200}
              onError={() => setPhotoFailedFor(venueId)}
            />
          ) : (
            <View
              className="w-full h-36 items-center justify-center"
              style={{
                experimental_backgroundImage:
                  'linear-gradient(135deg, rgba(168,85,247,0.25), #1a0f2e 55%, rgba(212,255,0,0.15))',
              }}
            >
              <Text className="text-5xl font-sans-semibold text-white/20">
                {venue?.name?.[0] ?? ''}
              </Text>
            </View>
          )}
          <View
            className="absolute inset-x-0 bottom-0 h-20"
            style={{
              experimental_backgroundImage:
                'linear-gradient(to top, #0d0a18, rgba(13,10,24,0.4), transparent)',
            }}
          />
          {venue ? (
            <Pressable
              onPress={openMenu}
              hitSlop={8}
              className="absolute left-3 top-3 w-8 h-8 rounded-full bg-black/50 items-center justify-center"
            >
              <SymbolView name="ellipsis" size={15} tintColor="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="absolute right-3 top-3 w-8 h-8 rounded-full bg-black/50 items-center justify-center"
          >
            <SymbolView name="xmark" size={14} tintColor="#ffffff" />
          </Pressable>
          <View className="absolute bottom-0 left-0 right-0 px-5 pb-3">
            {venue?.is_map_promoted ? (
              <View className="self-start px-2 py-0.5 mb-1.5 rounded-full bg-[#d4ff00]/15 border border-[#d4ff00]/20">
                <Text className="text-[10px] font-sans-medium" style={{ color: NEON }}>
                  Featured Tonight
                </Text>
              </View>
            ) : null}
            <Text className="text-xl font-sans-semibold text-white leading-tight">
              {venue?.name ?? ''}
            </Text>
          </View>
        </View>

        {isError ? (
          // The sheet stays dismissible (X above); the body offers Retry
          <View className="items-center px-6 py-10 gap-3">
            <SymbolView name="wifi.exclamationmark" size={26} tintColor="rgba(255,255,255,0.4)" />
            <Text className="text-white text-sm font-sans-semibold">Couldn&apos;t load this venue</Text>
            <Text className="text-white/50 text-xs font-sans text-center">Check your connection and try again.</Text>
            <Pressable
              onPress={() => refetch()}
              disabled={isRefetching}
              accessibilityRole="button"
              className="mt-1 min-h-10 px-5 rounded-full items-center justify-center active:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: NEON }}
            >
              {isRefetching ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text className="text-black text-sm font-sans-semibold">Retry</Text>
              )}
            </Pressable>
          </View>
        ) : !isLoading && data === null ? (
          <View className="items-center px-6 py-10 gap-2">
            <Text className="text-white text-sm font-sans-semibold">This venue isn&apos;t available</Text>
            <Text className="text-white/50 text-xs font-sans text-center">It may have been removed.</Text>
          </View>
        ) : isLoading || !venue ? (
          <View className="items-center py-16">
            <ActivityIndicator color={NEON} />
          </View>
        ) : (
        <View className="px-5 pt-2 pb-5">
          {metaParts.length > 0 ? (
            <Text className="text-xs text-white/60 font-sans mb-3">{metaParts.join(' · ')}</Text>
          ) : null}

          {/* ── ZONE 2: Social — who's here leads the card ── */}
          <View className="mb-3 gap-3">
            {friendsHere.length > 0 ? (
              <WhosHere friends={friendsHere} planning={friendsPlanning} />
            ) : (
              <>
                <Text className="text-sm font-sans-medium" style={{ color: 'rgba(212,255,0,0.8)' }}>
                  Be the first spotted here tonight
                </Text>
                {friendsPlanning.length > 0 ? <PlanningRow friends={friendsPlanning} /> : null}
              </>
            )}
          </View>

          {/* Invite: the headline action when nobody is here, quieter once
              the who's-here card carries the story */}
          <Pressable
            onPress={() => setInvitePickerOpen(true)}
            accessibilityRole="button"
            className={`w-full min-h-11 mb-3 rounded-xl flex-row items-center justify-center gap-2 active:opacity-90 ${friendsHere.length > 0 ? outlineControl : ''}`}
            style={friendsHere.length > 0 ? undefined : { backgroundColor: NEON }}
          >
            <SymbolView name="person.badge.plus" size={16} tintColor={friendsHere.length > 0 ? '#ffffff' : '#000000'} />
            <Text className={`font-sans-semibold text-[15px] ${friendsHere.length > 0 ? 'text-white' : 'text-black'}`}>
              Invite friends here
            </Text>
          </Pressable>

          {/* ── ZONE 3: Utility row — Save has a label and a clear on state ── */}
          <View className="flex-row items-center gap-2 mb-3">
            <Pressable
              onPress={openDirections}
              accessibilityRole="button"
              className={`flex-row items-center gap-1.5 min-h-10 px-3 rounded-lg active:opacity-70 ${control.ordinary}`}
            >
              <SymbolView name="mappin" size={13} tintColor="rgba(255,255,255,0.7)" />
              <Text className="text-white/80 text-xs font-sans-medium">Directions</Text>
            </Pressable>
            <Pressable
              onPress={shareVenue}
              accessibilityRole="button"
              className={`flex-row items-center gap-1.5 min-h-10 px-3 rounded-lg active:opacity-70 ${control.ordinary}`}
            >
              <SymbolView name="square.and.arrow.up" size={13} tintColor="rgba(255,255,255,0.7)" />
              <Text className="text-white/80 text-xs font-sans-medium">Share</Text>
            </Pressable>
            <Pressable
              onPress={toggleWishlist}
              accessibilityRole="button"
              accessibilityLabel={isInWishlist ? 'Saved. Remove from wishlist' : 'Save to wishlist'}
              accessibilityState={{ selected: isInWishlist }}
              className={`flex-row items-center gap-1.5 min-h-10 px-3 rounded-lg active:opacity-70 ${isInWishlist ? control.selected : control.ordinary}`}
            >
              <SymbolView
                name={isInWishlist ? 'bookmark.fill' : 'bookmark'}
                size={13}
                tintColor={isInWishlist ? NEON : 'rgba(255,255,255,0.7)'}
              />
              <Text className="text-xs font-sans-medium" style={{ color: isInWishlist ? NEON : 'rgba(255,255,255,0.8)' }}>
                {isInWishlist ? 'Saved' : 'Save'}
              </Text>
            </Pressable>
          </View>

          {/* More Info — open by default */}
          <Pressable
            onPress={() => setMoreInfoOpen((v) => !v)}
            className="flex-row items-center justify-between py-2"
          >
            <Text className="text-white/55 text-xs font-sans">More Info</Text>
            <SymbolView
              name={moreInfoOpen ? 'chevron.up' : 'chevron.down'}
              size={12}
              tintColor="rgba(255,255,255,0.4)"
            />
          </Pressable>
          {moreInfoOpen ? (
            // A plain View, NOT a ScrollView: under fitToContents the sheet
            // measures once, and a nested scroller that fills after its data
            // arrives (hours, Trending Nearby) overflows the measured height
            // and paints over the card. Sized content grows the sheet instead.
            <View className="pt-2 pb-1 gap-3">
              <VenueEventsSection venueId={venue.id} />

              {hoursData?.hours ? (
                <Text className="text-xs text-white/55 font-sans">
                  {hoursData.hours.isOpen ? 'Open now' : 'Closed'}
                  {hoursData.hours.displayText ? ` · ${hoursData.hours.displayText}` : ''}
                </Text>
              ) : null}

              {data!.similarVenues.length > 0 ? (
                <View>
                  <Text className="text-xs font-sans-semibold text-white/50 mb-1.5">
                    Trending Nearby
                  </Text>
                  <View className="gap-1.5">
                    {data!.similarVenues.map((sv) => (
                      <Pressable
                        key={sv.id}
                        onPress={() => {
                          setMoreInfoOpen(false);
                          router.setParams({ venueId: sv.id });
                        }}
                        className="p-2.5 bg-white/[0.03] rounded-lg active:bg-white/[0.06]"
                      >
                        <Text className="text-white text-sm font-sans-medium">{sv.name}</Text>
                        {sv.neighborhood ? (
                          <Text className="text-[10px] text-white/55 font-sans">
                            {sv.neighborhood}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {hoursData?.rating ? (
                <Text className="text-[10px] text-white/45 font-sans text-center pb-1">
                  {hoursData.rating.toFixed(1)} on Google (
                  {(hoursData.ratingsCount ?? 0).toLocaleString()})
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        )}
      </View>
    </View>
  );
}
