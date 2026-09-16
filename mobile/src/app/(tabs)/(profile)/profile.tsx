import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { getVenuePhotoUrl } from '@/lib/venues';
import { muxThumbnailUrl } from '@/lib/mux';
import { stopSharing } from '@/lib/night-status';
import { DEFAULT_AUDIENCE, isAudience, type Audience } from '@/lib/audience';
import { useSession } from '@/hooks/use-session';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useNotifications } from '@/hooks/use-notifications';
import { invalidateNightStatusQueries, useOwnNightStatus } from '@/hooks/use-own-night-status';
import { Avatar } from '@/components/avatar';
import { AudienceRow } from '@/components/audience-row';
import { HeaderActions } from '@/components/header-actions';
import { NEON, PURPLE, outlineControl } from '@/lib/theme';

type SpotsView = 'recent' | 'wishlist' | 'posts';

const SPOTS_LABELS: Record<SpotsView, string> = {
  recent: 'Recent Spots',
  wishlist: 'Wishlist',
  posts: 'Your Posts',
};

interface ProfileData {
  profile: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    location_sharing_level: string | null;
  } | null;
  placesCount: number;
  weeklyCount: number;
  recentSpots: Array<{ venue_id: string | null; venue_name: string }>;
  wishlist: Array<{ id: string; venue_name: string }>;
  posts: Array<{
    id: string;
    image_url: string | null;
    media_type: string | null;
    mux_playback_id: string | null;
    text: string;
    likes_count: number | null;
    comments_count: number | null;
  }>;
  inviteCode: string | null;
}

async function fetchProfileData(userId: string): Promise<ProfileData> {
  const [profileRes, checkinsRes, wishlistRes, postsRes, inviteRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, username, avatar_url, location_sharing_level')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('checkins')
      .select('venue_id, venue_name, started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false }),
    supabase
      .from('wishlist_places')
      .select('id, venue_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('posts')
      .select('id, image_url, media_type, mux_playback_id, text, likes_count, comments_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('invite_codes')
      .select('code')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const checkins = checkinsRes.data ?? [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Recent spots: unique venues, most recent first
  const seen = new Set<string>();
  const recentSpots: ProfileData['recentSpots'] = [];
  for (const c of checkins) {
    if (!c.venue_name || seen.has(c.venue_name)) continue;
    seen.add(c.venue_name);
    recentSpots.push({ venue_id: c.venue_id, venue_name: c.venue_name });
    if (recentSpots.length >= 9) break;
  }

  return {
    profile: profileRes.data ?? null,
    placesCount: new Set(checkins.map((c) => c.venue_name)).size,
    weeklyCount: checkins.filter((c) => c.started_at && c.started_at > weekAgo).length,
    recentSpots,
    wishlist: wishlistRes.data ?? [],
    posts: postsRes.data ?? [],
    inviteCode: inviteRes.data?.code ?? null,
  };
}

function GridTile({ label, imageUrl }: { label: string; imageUrl?: string | null }) {
  return (
    <View className="gap-1.5" style={{ width: '31%' }}>
      <View className="aspect-square rounded-xl overflow-hidden bg-[#1a0a2e] border border-white/[0.08] items-center justify-center">
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} className="w-full h-full" contentFit="cover" />
        ) : (
          <SymbolView name="mappin" size={22} tintColor="rgba(168,85,247,0.5)" />
        )}
      </View>
      <Text className="text-white text-xs font-sans-medium text-center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EmptyCard({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View className="items-center py-10 px-4 bg-white/5 rounded-2xl border border-white/[0.08]">
      <View className="w-14 h-14 rounded-full bg-white/5 items-center justify-center mb-3 border border-white/[0.08]">
        <SymbolView name={icon as never} size={24} tintColor="rgba(168,85,247,0.6)" />
      </View>
      <Text className="text-base font-sans-semibold text-white mb-1">{title}</Text>
      <Text className="text-white/50 text-xs font-sans text-center">{subtitle}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const queryClient = useQueryClient();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const [spotsView, setSpotsView] = useState<SpotsView>('recent');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['profile-page', session?.user.id],
    enabled: !!session,
    queryFn: () => fetchProfileData(session!.user.id),
  });
  const contentContainerStyle = useResolveClassNames('px-4 pb-10 gap-5');

  const profile = data?.profile;
  // The card reads the ONE shared status query so it can never lag Plans/Map
  const { data: ownNight } = useOwnNightStatus();
  const status = ownNight?.status ?? null;
  const sharingLevel: Audience = isAudience(profile?.location_sharing_level)
    ? profile.location_sharing_level
    : DEFAULT_AUDIENCE;
  const planningLevel: Audience = isAudience(status?.planning_visibility)
    ? status.planning_visibility
    : DEFAULT_AUDIENCE;

  const syncStatus = () => {
    refetch();
    invalidateNightStatusQueries(queryClient);
  };

  // Audience changes come back from the "Who can see this?" sheet's Confirm —
  // a live status keeps its venue; only who can see it changes.
  const setSharingLevel = async (level: Audience) => {
    if (!session) return;
    await supabase
      .from('profiles')
      .update({ location_sharing_level: level })
      .eq('id', session.user.id);
    syncStatus();
  };

  const setPlanningVisibility = async (level: Audience) => {
    if (!session) return;
    await supabase
      .from('night_statuses')
      .update({ planning_visibility: level })
      .eq('user_id', session.user.id);
    syncStatus();
  };

  /** Stop sharing ≠ No: the night stays answered "out", but friends can no longer see you. */
  const handleStopSharing = async () => {
    if (!session) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await stopSharing(session.user.id, { city: ownNight?.city });
    } finally {
      syncStatus();
    }
  };

  const statusKind = status?.status ?? null;
  const statusHeadline =
    statusKind === 'out'
      ? 'Out tonight'
      : statusKind === 'planning'
        ? 'TBD tonight'
        : statusKind === 'off'
          ? 'Out tonight · hidden'
          : 'Not out tonight';
  const statusLine =
    statusKind === 'out'
      ? (status?.venue_name ?? 'Somewhere')
      : statusKind === 'planning'
        ? (status?.planning_neighborhood ?? 'Anywhere')
        : statusKind === 'off'
          ? 'Location hidden'
          : 'Staying in';

  const shareProfile = () => router.push('/invite-friends');

  const cycleSpotsView = () => {
    const order: SpotsView[] = ['recent', 'wishlist', 'posts'];
    setSpotsView(order[(order.indexOf(spotsView) + 1) % order.length]);
  };

  return (
    <View className="flex-1">
      {/* Header — static, web PageHeader parity */}
      <View className="pt-safe-offset-3 z-10" style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}>
        <View className="flex-row items-center justify-between px-4 h-10 mb-2">
          <Text
            className="text-white font-sans-light"
            numberOfLines={1}
            style={{ fontSize: 20, letterSpacing: 20 * 0.28 }}
          >
            Spotted
          </Text>
          <HeaderActions unreadCount={unreadCount} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColorClassName="accent-[#d4ff00]"
          />
        }
      >
        {/* Avatar + name + username */}
        <View className="flex-row items-center gap-3 pt-4">
          <Pressable onPress={() => router.push('/edit-profile')} className="active:opacity-80">
            <View className="rounded-full border border-[#d4ff00]/30 p-0.5">
              <Avatar
                name={profile?.display_name ?? 'U'}
                url={profile?.avatar_url ?? null}
                size="lg"
              />
            </View>
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text className="text-lg font-sans-medium text-white" numberOfLines={1}>
              {profile?.display_name ?? (isLoading ? ' ' : 'User')}
            </Text>
            <Text className="text-sm text-white/55 font-sans" numberOfLines={1}>
              @{profile?.username ?? ''}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-white/65 font-sans">
            <Text className="text-white font-sans-medium">{data?.placesCount ?? 0}</Text> spots
          </Text>
          <Text className="text-white/25">·</Text>
          <Pressable onPress={() => router.push('/friends')} hitSlop={4}>
            <Text className="text-sm text-white/65 font-sans">
              <Text className="text-white font-sans-medium">{friendIds?.length ?? 0}</Text> friends
            </Text>
          </Pressable>
          <Text className="text-white/25">·</Text>
          <Text className="text-sm text-white/65 font-sans">
            <Text className="text-white font-sans-medium">{data?.weeklyCount ?? 0}</Text> this week
          </Text>
        </View>

        {/* Edit profile / Share profile / Settings — full labels so neither
            reads as posting or location sharing (client feedback §6) */}
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => router.push('/edit-profile')}
            accessibilityRole="button"
            className={`flex-1 min-h-11 rounded-full items-center justify-center ${outlineControl}`}
          >
            <Text className="text-white text-sm font-sans-medium">Edit profile</Text>
          </Pressable>
          <Pressable
            onPress={shareProfile}
            accessibilityRole="button"
            className={`flex-1 min-h-11 rounded-full items-center justify-center ${outlineControl}`}
          >
            <Text className="text-white text-sm font-sans-medium">Share profile</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            className={`w-11 min-h-11 rounded-full items-center justify-center ${outlineControl}`}
          >
            <SymbolView name="gearshape" size={16} tintColor="#ffffff" />
          </Pressable>
        </View>

        {/* Friends row */}
        <Pressable
          onPress={() => router.push('/friends')}
          className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] active:bg-white/[0.06]"
        >
          <View className="w-9 h-9 rounded-full bg-[#a855f7]/15 items-center justify-center">
            <SymbolView name="person.2" size={15} tintColor={PURPLE} />
          </View>
          <View className="flex-1">
            <Text className="text-white text-sm font-sans-medium">Friends</Text>
            <Text className="text-white/30 text-xs font-sans">
              See everyone you&apos;re connected with
            </Text>
          </View>
          <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.2)" />
        </Pressable>

        {/* Find from Contacts (web ContactsSync entry) */}
        <Pressable
          onPress={() => router.push('/contacts-sync')}
          className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-[#a855f7]/20 active:bg-white/[0.06]"
        >
          <View className="w-9 h-9 rounded-full bg-[#a855f7]/20 items-center justify-center">
            <SymbolView name="person.crop.circle.badge.plus" size={15} tintColor={PURPLE} />
          </View>
          <View className="flex-1">
            <Text className="text-white text-sm font-sans-medium">Find Friends from Contacts</Text>
            <Text className="text-white/30 text-xs font-sans">
              See who&apos;s already on Spotted
            </Text>
          </View>
          <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.2)" />
        </Pressable>

        {/* Invite Friends row (web InviteFriendsSection) */}
        <Pressable
          onPress={() => router.push('/invite-friends')}
          className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-[#2d1b4e]/60 border border-white/20 active:bg-[#2d1b4e]/80"
        >
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: PURPLE }}
          >
            <SymbolView name="link" size={15} tintColor="#ffffff" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-sm font-sans-medium">Invite Friends</Text>
            <Text className="text-white/30 text-xs font-sans">
              Share your link or QR code to add friends instantly
            </Text>
          </View>
          <SymbolView name="qrcode" size={16} tintColor="rgba(255,255,255,0.4)" />
        </Pressable>

        {/* Tonight status card — status / venue / audience, Update + Stop sharing */}
        <View className="bg-[#1F1740] border border-[#d4ff00]/25 rounded-2xl p-4 gap-2.5">
          <View className="flex-row items-center gap-1.5">
            <View
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor:
                  statusKind === 'out' ? NEON : statusKind === 'planning' ? PURPLE : 'rgba(255,255,255,0.3)',
              }}
            />
            <Text className="text-[11px] text-white/60 uppercase tracking-wider font-sans-semibold">
              {statusHeadline}
            </Text>
          </View>

          <Text className="text-xl font-sans-medium text-white" numberOfLines={2}>
            {statusLine}
          </Text>

          {statusKind === 'out' ? (
            <AudienceRow value={sharingLevel} onChange={setSharingLevel} compact />
          ) : statusKind === 'planning' ? (
            <AudienceRow value={planningLevel} onChange={setPlanningVisibility} compact />
          ) : statusKind === 'off' ? (
            <Text className="text-xs text-white/55 font-sans">
              Friends can&apos;t see you right now. Update your status to share again.
            </Text>
          ) : (
            <Text className="text-xs text-white/55 font-sans">
              Going out after all? Update your status to see who&apos;s where.
            </Text>
          )}

          <View className="flex-row gap-2 mt-1">
            <Pressable
              onPress={() => router.push('/check-in')}
              className="flex-1 py-2.5 rounded-full items-center active:opacity-90"
              style={{ backgroundColor: NEON }}
            >
              <Text className="text-[#15102E] text-sm font-sans-medium">Update status</Text>
            </Pressable>
            {statusKind === 'out' || statusKind === 'planning' ? (
              <Pressable
                onPress={handleStopSharing}
                className="flex-1 py-2.5 rounded-full items-center border border-red-400/40 active:bg-red-500/10"
              >
                <Text className="text-red-300 text-sm font-sans-medium">Stop sharing</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Spots section */}
        <View>
          <Pressable onPress={cycleSpotsView} className="flex-row items-center gap-2 mb-1">
            <Text className="text-xl font-sans-semibold text-white">
              {SPOTS_LABELS[spotsView]}
            </Text>
            <SymbolView name="chevron.up.chevron.down" size={13} tintColor="rgba(255,255,255,0.5)" />
          </Pressable>
          <Text className="text-white/60 text-sm font-sans mb-3">Only you can see</Text>

          {spotsView === 'recent' ? (
            (data?.recentSpots ?? []).length > 0 ? (
              <View className="flex-row flex-wrap gap-3">
                {(data?.recentSpots ?? []).map((spot) => (
                  <GridTile
                    key={spot.venue_name}
                    label={spot.venue_name}
                    imageUrl={spot.venue_id ? getVenuePhotoUrl(spot.venue_id, 0) : null}
                  />
                ))}
              </View>
            ) : (
              <EmptyCard
                icon="mappin.and.ellipse"
                title="Your night out history starts here"
                subtitle="Share your spot at venues and they'll show up on your profile."
              />
            )
          ) : spotsView === 'wishlist' ? (
            (data?.wishlist ?? []).length > 0 ? (
              <View className="flex-row flex-wrap gap-3">
                {(data?.wishlist ?? []).map((place) => (
                  <GridTile key={place.id} label={place.venue_name} />
                ))}
              </View>
            ) : (
              <EmptyCard
                icon="bookmark"
                title="Build your wishlist"
                subtitle="Save spots you want to check out. They'll live here."
              />
            )
          ) : (data?.posts ?? []).length > 0 ? (
            <View className="flex-row flex-wrap gap-3">
              {(data?.posts ?? []).map((post) => (
                <GridTile
                  key={post.id}
                  label={`♥ ${post.likes_count ?? 0} · 💬 ${post.comments_count ?? 0}`}
                  imageUrl={
                    post.media_type === 'video'
                      ? post.mux_playback_id
                        ? muxThumbnailUrl(post.mux_playback_id, { width: 480 })
                        : null
                      : post.image_url
                  }
                />
              ))}
            </View>
          ) : (
            <EmptyCard
              icon="camera"
              title="No posts yet"
              subtitle="Share moments from your nights out and they'll appear here."
            />
          )}
        </View>

        {/* Log out */}
        <Pressable
          onPress={() => supabase.auth.signOut()}
          className="flex-row items-center justify-center gap-2 py-3 rounded-full border border-red-500/40 active:bg-red-500/10"
        >
          <SymbolView name="rectangle.portrait.and.arrow.right" size={15} tintColor="#f87171" />
          <Text className="text-red-400 text-sm font-sans-medium">Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
