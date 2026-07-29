import { useEffect, useRef, useState, useCallback } from 'react';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard, FriendCardData } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useUserCity } from '@/hooks/useUserCity';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { CITY_CENTERS } from '@/lib/city-detection';
import { supabase } from '@/integrations/supabase/client';
import { createResilientChannel } from '@/lib/resilient-channel';
import { stopSharing, goOutAtVenue } from '@/lib/night-status';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare, Crosshair, MapPin, MapPinOff, Bell, ChevronDown, Search, X, SlidersHorizontal, ArrowLeft, Users, Building2, Target, Home, Map as MapIcon, Music, Wine, Beer, Building, UtensilsCrossed, UserPlus, Loader2 } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { NotificationBadge } from '@/components/NotificationBadge';
import { FriendsPlanning } from '@/components/FriendsPlanning';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useToast } from '@/hooks/use-toast';
import { CityBadge } from '@/components/CityBadge';
import { logger } from '@/lib/logger';
import { escapeHtml, escapeUrl } from '@/lib/html-escape';
import { useFriendsOutStatus } from '@/hooks/useFriendsOutStatus';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useFriendIds } from '@/hooks/useFriendIds';

// ── Shared marker sizing — single source of truth for all map markers ──
const MARKER = {
  // People
  friendSolo:       44,   // individual friend avatar diameter (px)
  friendGroupMember: 36,  // avatar inside a group marker (px)
  friendGroup2_3:   72,   // container for 2-3 friends
  friendGroup4Plus: 80,   // container for 4+ friends
  userSelf:         52,   // current user's own marker
  ringWidth:        3,    // relationship ring thickness (px)

  // Venues — deliberately smaller / muted so friends dominate
  venueClusterRadii: [12, 16, 20] as const,  // small / medium / large cluster circle radius
  venueClusterOpacity: 0.6,                  // fill opacity (was 0.85)
  venueClusterStroke: 1.5,                   // stroke width
  venueClusterStrokeColor: 'rgba(255,255,255,0.5)',
  venuePinSize:     28,   // individual unclustered pin canvas size
  venuePromoted:    42,   // promoted venue marker outer size
  venuePromotedInner: 30, // promoted venue inner circle

  // Z-order — friends always above venues
  zFriendClose:   '20',
  zFriendDirect:  '18',
  zFriendMutual:  '16',
  zUser:          '25',
  zVenuePromoted: '10',   // below all friend markers
} as const;

const PEOPLE_BG = '#0e7490'; // cyan-700 — avatar fill, distinct from venue purple

// Single source of truth for relationship ring colors — must match the legend
const RELATIONSHIP_COLORS = {
  close:  '#d4ff00',  // yellow-lime
  direct: '#9333ea',  // purple-600 (legend: "Friend")
  mutual: '#6366f1',  // indigo (legend: "Mutual")
} as const;

const RING_COLORS: Record<string, { border: string; shadow: string }> = {
  close:  { border: RELATIONSHIP_COLORS.close,  shadow: 'rgba(212, 255, 0, 0.4)' },
  direct: { border: RELATIONSHIP_COLORS.direct, shadow: 'rgba(147, 51, 234, 0.4)' },
  mutual: { border: RELATIONSHIP_COLORS.mutual, shadow: 'rgba(99, 102, 241, 0.4)' },
};

/** Avatar circle with onerror fallback to initials */
function avatarHtml(avatarUrl: string | null | undefined, displayName: string, size: string, extraStyle = '') {
  const initial = escapeHtml(displayName?.[0] || 'U');
  const fallbackBg = PEOPLE_BG;
  const initialsDiv = `<div style="width:${size};height:${size};border-radius:50%;background:${fallbackBg};display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:calc(${size}*0.45);${extraStyle}">${initial}</div>`;
  const safeUrl = avatarUrl ? escapeUrl(avatarUrl) : null;
  if (!safeUrl) return initialsDiv;
  // Render img with onerror that swaps to initials
  const escapedInitials = initialsDiv.replace(/"/g, '&quot;');
  return `<img src="${safeUrl}" style="width:${size};height:${size};border-radius:50%;object-fit:cover;${extraStyle}" alt="${escapeHtml(displayName)}" onerror="this.outerHTML='${escapedInitials}'" />`;
}

/** Single person avatar circle with relationship-colored ring */
function personCircleHtml(avatarUrl: string | null | undefined, displayName: string, size: string, relType: string = 'direct') {
  const ring = RING_COLORS[relType] || RING_COLORS.direct;
  return `<div style="width:${size};height:${size};border-radius:50%;border:${MARKER.ringWidth}px solid ${ring.border};box-shadow:0 0 8px ${ring.shadow};padding:1px;box-sizing:border-box;flex-shrink:0;">
    ${avatarHtml(avatarUrl, displayName, '100%', '')}
  </div>`;
}

/** Group marker: up to 3 member circles inside a larger container, +N badge only when >3 */
function groupMarkerHtml(members: { avatarUrl: string | null | undefined; displayName: string; relType: string }[], totalCount: number) {
  const shown = members.slice(0, 3);
  const extra = totalCount - shown.length;
  const containerSize = totalCount <= 3 ? MARKER.friendGroup2_3 : MARKER.friendGroup4Plus;
  const memberSize = MARKER.friendGroupMember;

  // Position members in a triangle/line layout — offsets scaled to container
  let membersHtml = '';
  if (shown.length === 1) {
    membersHtml = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">${personCircleHtml(shown[0].avatarUrl, shown[0].displayName, memberSize + 'px', shown[0].relType)}</div>`;
  } else if (shown.length === 2) {
    membersHtml = `
      <div style="position:absolute;top:50%;left:50%;transform:translate(-75%,-50%);">${personCircleHtml(shown[0].avatarUrl, shown[0].displayName, memberSize + 'px', shown[0].relType)}</div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-5%,-50%);">${personCircleHtml(shown[1].avatarUrl, shown[1].displayName, memberSize + 'px', shown[1].relType)}</div>`;
  } else {
    membersHtml = `
      <div style="position:absolute;top:2px;left:50%;transform:translateX(-50%);">${personCircleHtml(shown[0].avatarUrl, shown[0].displayName, memberSize + 'px', shown[0].relType)}</div>
      <div style="position:absolute;bottom:2px;left:4px;">${personCircleHtml(shown[1].avatarUrl, shown[1].displayName, memberSize + 'px', shown[1].relType)}</div>
      <div style="position:absolute;bottom:2px;right:4px;">${personCircleHtml(shown[2].avatarUrl, shown[2].displayName, memberSize + 'px', shown[2].relType)}</div>`;
  }

  // Badge only when there are hidden members (>3)
  const badge = extra > 0
    ? `<div style="position:absolute;bottom:-5px;right:-5px;min-width:20px;height:20px;background:#1a0f2e;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;font-size:11px;font-weight:700;color:white;border:1.5px solid rgba(255,255,255,0.3);">+${extra}</div>`
    : '';

  // Container: stroke-only, no fill — just a grouping hint
  return `<div style="position:relative;width:${containerSize}px;height:${containerSize}px;">
    <div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(255,255,255,0.12);"></div>
    ${membersHtml}
    ${badge}
  </div>`;
}
import { isFromTonight, isFreshLocation } from '@/lib/time-context';
import { QuickStatusSheet } from '@/components/QuickStatusSheet';
import { UpdateSpotSheet } from '@/components/UpdateSpotSheet';
import { VenueMoveBanner } from '@/components/VenueMoveBanner';
import { PlanningReadyBanner } from '@/components/PlanningReadyBanner';
import { useVenueArrivalNudge, type VenueShiftData } from '@/hooks/useVenueArrivalNudge';
import { FriendSearchModal } from '@/components/FriendSearchModal';

interface FriendLocation {
  user_id: string;
  lat: number;
  lng: number;
  venue_name: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  };
  relationshipType?: 'close' | 'direct' | 'mutual';
  is_private_party?: boolean;
  party_neighborhood?: string | null;
  last_location_at?: string | null;
}

const getStalenessMins = (lastLocationAt?: string | null): number => {
  if (!lastLocationAt) return 999;
  return (Date.now() - new Date(lastLocationAt).getTime()) / 60000;
};

const formatLastSeen = (mins: number): string => {
  if (mins < 5) return 'Now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  return `${Math.round(mins / 60)}h ago`;
};

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  lat: number;
  lng: number;
  is_demo: boolean;
  heatScore: number;
  is_map_promoted?: boolean;
}

export default function Map() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();
  const { data: friendsOutData } = useFriendsOutStatus();
  const { city } = useUserCity();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const { data: cachedAllProfiles } = useProfilesSafe();
  const { data: cachedFriendIds } = useFriendIds(user?.id);

  // Venue arrival nudge with shift detection callback
  const handleVenueShift = useCallback((data: VenueShiftData) => {
    if (!venueMoveDismissedRef.current) {
      setVenueShiftData(data);
      setShowVenueMoveBanner(true);
    }
  }, []);
  useVenueArrivalNudge(handleVenueShift);
  
  useAutoVenueTracking(); // Trigger auto-venue tracking on map view
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueFilter, setVenueFilter] = useState<'all' | 'nightclub' | 'cocktail_bar' | 'bar' | 'rooftop' | 'restaurant'>('all');
  // Use Map object keyed by user_id to prevent duplicate markers
  const friendMarkersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const venueMarkersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userLocationTimestampRef = useRef<number>(0);
  const [isLocating, setIsLocating] = useState(false);
  const [userProfile, setUserProfile] = useState<{ avatar_url: string | null; display_name: string } | null>(null);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [userInCluster, setUserInCluster] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<{
    friends: FriendLocation[];
    venueName: string;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<'both' | 'friends' | 'venues'>('both');
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchFilterPeople, setSearchFilterPeople] = useState(true);
  const [searchFilterVenues, setSearchFilterVenues] = useState(true);
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | 'close' | 'friends_only'>('all');
  const friendsListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Status pill & quick-switch state
  const [showQuickStatus, setShowQuickStatus] = useState(false);
  const [showUpdateSpot, setShowUpdateSpot] = useState(false);
  const [currentUserStatus, setCurrentUserStatus] = useState<string | null>(null);
  const [currentUserVenue, setCurrentUserVenue] = useState<string | null>(null);
  
  // Smart venue prompt for planning users
  const [smartPromptVenue, setSmartPromptVenue] = useState<{ id: string; name: string; lat: number; lng: number } | null>(null);
  const [showSmartPrompt, setShowSmartPrompt] = useState(false);
  const smartPromptDismissedRef = useRef<Set<string>>(new globalThis.Set());
  
  // Venue move banner state
  const [venueShiftData, setVenueShiftData] = useState<VenueShiftData | null>(null);
  const [showVenueMoveBanner, setShowVenueMoveBanner] = useState(false);
  const venueMoveDismissedRef = useRef(false);
  
  // Planning ready banner — once per session
  const [showPlanningReady, setShowPlanningReady] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const planningReadyShownRef = useRef(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  
  // Use ref for city to prevent callback recreation
  const cityRef = useRef(city);
  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  // Use ref for demoEnabled to ensure fetch always has latest value
  const demoEnabledRef = useRef(demoEnabled);
  useEffect(() => {
    demoEnabledRef.current = demoEnabled;
  }, [demoEnabled]);

  // Stable ref for the fetch function to avoid callback recreation
  const fetchFriendsLocationsRef = useRef<() => Promise<void>>();
  
  useEffect(() => {
    if (user) {
      fetchFriendsLocations();
    }
  }, [user, demoEnabled, city]);

  // Auto-refresh on tab/app return
  useVisibilityRefresh(() => {
    if (user) fetchFriendsLocationsRef.current?.();
  });

  // Debounced fetch to prevent thundering herd on realtime events
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Stable debounced function that uses ref - never recreated
  const debouncedFetchFriendsLocations = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      fetchFriendsLocationsRef.current?.();
    }, 500);
  }, []); // Empty deps - truly stable

  // Real-time subscription for location updates - CONSOLIDATED into 1 channel
  useEffect(() => {
    if (!user) return;

    // Single unified channel for all map-related realtime updates
    const cleanupChannel = createResilientChannel({
      name: 'map-realtime',
      configure: (ch) => ch
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles' },
          (payload) => {
            console.log('Profile location updated:', payload);
            debouncedFetchFriendsLocations();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'night_statuses' },
          (payload) => {
            console.log('Night status updated:', payload);
            // Instantly update the user's own status pill without waiting for full refetch
            const row = payload.new as any;
            if (row && row.user_id === user.id) {
              setCurrentUserStatus(row.status || null);
              setCurrentUserVenue(row.venue_name || null);
              if (row.status === 'out' && row.lat && row.lng) {
                setUserLocation({ lat: row.lat, lng: row.lng });
              } else {
                setUserLocation(null);
              }
            }
            debouncedFetchFriendsLocations();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'checkins' },
          (payload) => {
            console.log('Checkin updated:', payload);
            debouncedFetchFriendsLocations();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'venues' },
          (payload) => {
            console.log('Venue promotion updated:', payload);
            debouncedFetchFriendsLocations();
          }
        ),
      onReconnect: debouncedFetchFriendsLocations,
    });

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      cleanupChannel();
    };
  }, [user]); // Removed debouncedFetchFriendsLocations from deps - it's stable now
  
  // Keep the ref updated with the latest fetch function
  useEffect(() => {
    fetchFriendsLocationsRef.current = fetchFriendsLocations;
  });

  const fetchFriendsLocations = async () => {
    if (!user) return;

    setIsLoadingFriends(true);

    try {
      // Get current user's profile for avatar
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('avatar_url, display_name, location_sharing_level')
        .eq('id', user.id)
        .single();


      // Store user profile for avatar marker
      if (myProfile) {
        setUserProfile({
          avatar_url: myProfile.avatar_url,
          display_name: myProfile.display_name || 'Me'
        });
      }

      // Check night_statuses to determine if user is out
      const { data: userNightStatus } = await supabase
        .from('night_statuses')
        .select('status, lat, lng')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      // Update user's location state — show pin if user is "out" and has coordinates
      if (userNightStatus?.status === 'out' && userNightStatus.lat && userNightStatus.lng) {
        setUserLocation({ lat: userNightStatus.lat, lng: userNightStatus.lng });
      } else {
        setUserLocation(null);
      }

      // Fetch current night status for status pill
      const { data: nightStatus } = await supabase
        .from('night_statuses')
        .select('status, venue_name, venue_id')
        .eq('user_id', user?.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      setCurrentUserStatus(nightStatus?.status || null);
      setCurrentUserVenue(nightStatus?.venue_name || null);

      // Show planning-ready banner once per session
      if (nightStatus?.status === 'planning' && !planningReadyShownRef.current) {
        planningReadyShownRef.current = true;
        setShowPlanningReady(true);
      }

      // Smart prompt: if planning, check if near a venue
      if (nightStatus?.status === 'planning' && 'geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true })
          );
          const { data: nearbyVenues } = await supabase.rpc('find_nearest_venue', {
            user_lat: pos.coords.latitude,
            user_lng: pos.coords.longitude,
            radius_meters: 200,
          });
          if (nearbyVenues && nearbyVenues.length > 0 && nearbyVenues[0].venue_name && !smartPromptDismissedRef.current.has(nearbyVenues[0].venue_id)) {
            setSmartPromptVenue({
              id: nearbyVenues[0].venue_id,
              name: nearbyVenues[0].venue_name,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            setShowSmartPrompt(true);
          }
        } catch {
          // GPS not available, skip smart prompt
        }
      }

      let friendLocations: FriendLocation[] = [];
      let friendIds: string[] = [];

      // When demo mode is ON, fetch demo users from database
      if (demoEnabledRef.current) {
        // Fetch all demo data in a single Promise.all to minimize await points
        // (each await allows React to interleave renders, which can cause hook errors)
        const now = new Date().toISOString();
        const [outRes, planRes, profileRes, sentRes, recvRes] = await Promise.all([
          supabase.from('night_statuses').select('user_id, lat, lng, venue_name, is_demo').eq('status', 'out').not('expires_at', 'is', null).gt('expires_at', now),
          supabase.from('night_statuses').select('user_id, planning_neighborhood, is_demo').eq('status', 'planning').not('expires_at', 'is', null).gt('expires_at', now),
          supabase.from('profiles').select('id, display_name, avatar_url, is_demo'),
          supabase.from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'accepted'),
          supabase.from('friendships').select('user_id').eq('friend_id', user.id).eq('status', 'accepted'),
        ]);

        const demoOutStatuses = outRes.data || [];
        const demoPlanningStatuses = planRes.data || [];
        const allProfiles = profileRes.data || [];
        const realFriendIds = new globalThis.Set([
          ...(sentRes.data?.map((f: any) => f.friend_id) || []),
          ...(recvRes.data?.map((f: any) => f.user_id) || []),
        ]);

        console.log('[DEMO] fetched - out:', demoOutStatuses.length, 'planning:', demoPlanningStatuses.length, 'profiles:', allProfiles.length, 'friendIds:', realFriendIds.size);

        // Build profile lookup (pure synchronous computation — no awaits)
        const profileLookup: Record<string, any> = {};
        for (const p of allProfiles) profileLookup[p.id] = p;

        // Filter and build friend locations
        const seenIds: Record<string, boolean> = {};
        const relTypes: ('close' | 'direct' | 'mutual')[] = ['close', 'direct', 'mutual'];

        friendLocations = demoOutStatuses
          .filter((s: any) => {
            if (seenIds[s.user_id]) return false;
            seenIds[s.user_id] = true;
            if (s.is_demo) return s.lat && s.lng;
            return realFriendIds.has(s.user_id) && s.lat && s.lng;
          })
          .map((s: any, i: number) => {
            const p = profileLookup[s.user_id];
            return {
              user_id: s.user_id,
              lat: s.lat,
              lng: s.lng,
              venue_name: s.venue_name || 'Out',
              last_location_at: new Date().toISOString(),
              profiles: {
                display_name: p?.display_name || 'Unknown',
                avatar_url: p?.avatar_url || null,
              },
              relationshipType: relTypes[i % relTypes.length],
            };
          });

        friendIds = friendLocations.map(f => f.user_id);
        console.log('[DEMO] built locations:', friendLocations.length);

        // Build planning friends data
        const planningFriendsData = demoPlanningStatuses
          .filter((s: any) => s.is_demo || realFriendIds.has(s.user_id))
          .map((s: any) => ({
            user_id: s.user_id,
            display_name: profileLookup[s.user_id]?.display_name || 'Friend',
            avatar_url: profileLookup[s.user_id]?.avatar_url || null,
            planning_neighborhood: s.planning_neighborhood || null,
          }));
        setPlanningFriends(planningFriendsData);
      } else {
        // Normal mode: show real friends only
        {
          const { data: sentFriendships } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

          const { data: receivedFriendships } = await supabase
            .from('friendships')
            .select('user_id')
            .eq('friend_id', user.id)
            .eq('status', 'accepted');

          friendIds = [
            ...(sentFriendships?.map(f => f.friend_id) || []),
            ...(receivedFriendships?.map(f => f.user_id) || [])
          ];
        }

        if (friendIds.length > 0) {
          // Get friends' profiles with location data via safe RPC function
          // This function properly masks location data based on can_see_location permissions
          let { data: allProfiles, error: profilesError } = await supabase.rpc('get_profiles_safe');

          // Retry once on any error (auth session may not be ready on cold load)
          if (profilesError) {
            console.warn('Map profiles RPC failed, retrying:', profilesError.message);
            await new Promise(r => setTimeout(r, 1000));
            const retry = await supabase.rpc('get_profiles_safe');
            allProfiles = retry.data;
            profilesError = retry.error;
          }

          // If RPC still fails, log and use empty array (direct profiles query
          // won't have location columns due to RLS grants)
          if (profilesError) {
            console.warn('Map profiles RPC retry failed:', profilesError.message);
            allProfiles = [];
          }
          
          // Filter to only friends who are out with valid, fresh location data
          const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
          let friendProfiles = (allProfiles || [])
            .filter((p: any) => {
              if (!friendIds.includes(p.id) || p.is_out !== true) return false;
              if (p.last_known_lat === null || p.last_known_lng === null) return false;
              return isFreshLocation(p.last_location_at);
            });
          
          // Only filter out demo users when demo mode is OFF (bootstrap mode)
          if (!demoEnabled) {
            friendProfiles = friendProfiles.filter((p: any) => p.is_demo === false);
          }

          // Expand map to include friends-of-friends with mutual_friends location sharing
          const { data: mutualData } = await supabase.rpc('get_mutual_friend_ids', { p_user_id: user.id });
          const mutualFriendIds = (mutualData || []).map((r: any) => r.user_id as string);

          if (mutualFriendIds.length > 0) {
            const { data: mutualStatuses } = await supabase
              .from('night_statuses')
              .select('user_id, venue_name, lat, lng')
              .in('user_id', mutualFriendIds)
              .eq('status', 'out')
              .not('expires_at', 'is', null)
              .gt('expires_at', new Date().toISOString());

            // Use allProfiles from get_profiles_safe (which respects RLS/server masking)
            // instead of direct profiles query (which fails on location columns)
            const mutualProfileMap = new globalThis.Map(
              (allProfiles || [])
                .filter((p: any) => mutualFriendIds.includes(p.id) && p.is_out === true)
                .map((p: any) => [p.id, p])
            );

            for (const ms of mutualStatuses || []) {
              const profile = mutualProfileMap.get(ms.user_id);
              if (profile && profile.location_sharing_level === 'mutual_friends') {
                // Use coords from get_profiles_safe (server-masked per viewer)
                // Apply same freshness rules as direct friends
                if (profile.last_known_lat != null && profile.last_known_lng != null
                    && isFromTonight(profile.last_location_at)
                    && profile.last_location_at
                    && (Date.now() - new Date(profile.last_location_at).getTime()) < TWO_HOURS_MS) {
                  friendProfiles.push(profile);
                  if (!friendIds.includes(ms.user_id)) friendIds.push(ms.user_id);
                }
              }
            }
          }

          // Get friends' night statuses to determine status type (including planning_neighborhood)
          const { data: statuses } = await supabase
            .from('night_statuses')
            .select('user_id, venue_name, status, planning_neighborhood, is_private_party, party_neighborhood, lat, lng')
            .in('user_id', friendIds)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString());

          const venueMap: Record<string, string> = {};
          const privatePartyMap: Record<string, { is_private_party: boolean; party_neighborhood: string | null; lat: number | null; lng: number | null }> = {};
          const planningFriendsData: { user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[] = [];
          
          statuses?.forEach(s => {
            if (s.status === 'planning') {
              // Find the profile for this planning friend
              const profile = (allProfiles || []).find((p: any) => p.id === s.user_id);
              // Filter out demo users in bootstrap mode (when demo mode is OFF)
              const isDemoUser = profile?.is_demo === true;
              const shouldExclude = bootstrapEnabled && !demoEnabled && isDemoUser;
              
              if (profile && friendIds.includes(s.user_id) && !shouldExclude) {
                planningFriendsData.push({
                  user_id: s.user_id,
                  display_name: profile.display_name || 'Friend',
                  avatar_url: profile.avatar_url,
                  planning_neighborhood: s.planning_neighborhood || null,
                });
              }
            } else if (s.venue_name) {
              venueMap[s.user_id] = s.venue_name;
            }
            // Track private party data
            if (s.is_private_party) {
              privatePartyMap[s.user_id] = {
                is_private_party: true,
                party_neighborhood: s.party_neighborhood || null,
                lat: s.lat || null,
                lng: s.lng || null,
              };
            }
          });
          
          setPlanningFriends(planningFriendsData);

          // Collect planning user IDs to exclude from "out" list (prevents duplicate)
          const planningUserIds = new globalThis.Set(planningFriendsData.map(f => f.user_id));

          // Get relationship types (close friends, mutual friends) - BATCHED QUERY
          const { data: closeFriends } = await supabase
            .from('close_friends')
            .select('close_friend_id')
            .eq('user_id', user.id);

          const closeFriendIds = new globalThis.Set(closeFriends?.map(cf => cf.close_friend_id) || []);

          // Batch query: Get all friendships for all friends in both directions
          const [fwdResult, revResult] = await Promise.all([
            supabase
              .from('friendships')
              .select('user_id, friend_id')
              .eq('status', 'accepted')
              .in('user_id', friendIds),
            supabase
              .from('friendships')
              .select('user_id, friend_id')
              .eq('status', 'accepted')
              .in('friend_id', friendIds),
          ]);

          // Build a map of each friend's connections (merge both directions)
          const friendConnections: Record<string, Set<string>> = {};
          const addConnection = (owner: string, conn: string) => {
            if (!friendConnections[owner]) friendConnections[owner] = new globalThis.Set();
            friendConnections[owner].add(conn);
          };
          fwdResult.data?.forEach(f => addConnection(f.user_id, f.friend_id));
          revResult.data?.forEach(f => addConnection(f.friend_id, f.user_id));

          // Determine relationship type for each friend in-memory (no N+1)
          const relationshipTypes: Record<string, 'close' | 'direct' | 'mutual'> = {};
          const friendIdSet = new globalThis.Set(friendIds);
          
          const mutualFriendIdSet = new globalThis.Set(mutualFriendIds);
          for (const friendId of friendIds) {
            if (closeFriendIds.has(friendId)) {
              relationshipTypes[friendId] = 'close';
            } else if (mutualFriendIdSet.has(friendId)) {
              // This is a friend-of-friend, not a direct friend
              relationshipTypes[friendId] = 'mutual';
            } else {
              relationshipTypes[friendId] = 'direct';
            }
          }

          // Exclude planning users from "out" markers
          // Private parties: show exact location for close/direct friends, hide map pin for mutuals
          friendLocations = (friendProfiles || []).filter((friend: any) => !planningUserIds.has(friend.id)).map((friend: any) => {
            const ppData = privatePartyMap[friend.id];
            const isPrivateParty = ppData?.is_private_party === true;
            const relationship = relationshipTypes[friend.id] || 'direct';

            // Mutual friends at private parties: no map pin (they see text only in friends list)
            if (isPrivateParty && relationship === 'mutual') {
              return null;
            }

            // For private parties, use GPS from night_statuses (exact location for close/direct friends)
            let lat = friend.last_known_lat;
            let lng = friend.last_known_lng;
            if (isPrivateParty && ppData?.lat && ppData?.lng) {
              lat = ppData.lat;
              lng = ppData.lng;
            }
            
            const venueName = isPrivateParty
              ? `Private Party${ppData?.party_neighborhood ? ` (${ppData.party_neighborhood})` : ''}`
              : venueMap[friend.id] || '';

            return {
              user_id: friend.id,
              lat,
              lng,
              venue_name: venueName,
              profiles: {
                display_name: friend.display_name || 'Unknown',
                avatar_url: friend.avatar_url,
              },
              relationshipType: relationshipTypes[friend.id] || 'direct',
              is_private_party: isPrivateParty,
              party_neighborhood: ppData?.party_neighborhood || null,
              last_location_at: friend.last_location_at || null,
            };
          });
        }
      }

      const finalFriends = friendLocations.filter(Boolean) as FriendLocation[];
      console.log('[DEBUG map] (5) setting friends:', finalFriends.length, 'locations', finalFriends.slice(0, 3).map(f => ({ name: f.profiles?.display_name, lat: f.lat, lng: f.lng, venue: f.venue_name })));
      setFriends(finalFriends);
      setIsLoadingFriends(false);

      logger.mapLoad(finalFriends.length, 0); // Log successful friends fetch
    } catch (error) {
      console.error('[DEBUG map] friends_fetch CAUGHT ERROR:', error);
      logger.apiError('map:friends_fetch', error);
      setIsLoadingFriends(false);
    }

    // Always fetch venues regardless of whether friend fetching succeeded
    try {
      await fetchVenuesWithHeatScores([]);
    } catch (error) {
      logger.apiError('map:venues_fetch_outer', error);
    }
  };

  // Simplified heat score calculation using popularity_rank instead of expensive queries
  const fetchVenuesWithHeatScores = async (friendIds: string[]) => {
    try {
      // DEBUG (2): Log venue query parameters
      console.log('[DEBUG map] (2) venue query: venues.select(*).eq(city,', cityRef.current, ')');

      // Fetch real venues filtered by city
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .eq('city', cityRef.current)
        .eq('is_demo', false);

      // DEBUG (3): Log venue query response
      console.log('[DEBUG map] (3) venue query response:', {
        count: venuesData?.length ?? 0,
        error: venuesError?.message ?? null,
        first3: (venuesData || []).slice(0, 3).map((v: any) => ({
          id: v.id?.slice(0, 8),
          name: v.name,
          lat: v.lat,
          lng: v.lng,
          city: v.city,
          is_demo: v.is_demo,
          neighborhood: v.neighborhood,
        })),
      });

      if (!venuesData) return;

      // Use popularity_rank as heat score (inverted: lower rank = higher heat)
      // This eliminates N+1 queries for posts/yaps per venue
      const venuesWithHeat = venuesData.map((venue) => {
        // Count friends at this venue (from already-loaded friends state)
        const friendsAtVenue = friends.filter(
          (f) => f.venue_name.toLowerCase() === venue.name.toLowerCase()
        ).length;

        // Heat score = friends present + popularity (100 - rank to invert)
        const popularityScore = 100 - (venue.popularity_rank || 50);
        const heatScore = (friendsAtVenue * 10) + popularityScore;

        return {
          ...venue,
          heatScore,
          is_map_promoted: venue.is_map_promoted || false,
        };
      });

      // Venues already filtered by city in the query
      const filteredVenues = venuesWithHeat;

      // Sort by heat score (descending)
      filteredVenues.sort((a, b) => b.heatScore - a.heatScore);

      setVenues(filteredVenues);
      logger.info('map:venues_load', { venueCount: filteredVenues.length, city: cityRef.current });
    } catch (error) {
      logger.apiError('map:venues_fetch', error);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      logger.error('map:init_failed', { reason: 'MAPBOX token missing' });
      return;
    }
    
    logger.info('map:init', { city });

    mapboxgl.accessToken = mapboxToken;
    
    const cityCenter = CITY_CENTERS[city];
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [cityCenter.lng, cityCenter.lat],
      zoom: 13,
    });

    // Track zoom level for clustering behavior
    map.current.on('zoom', () => {
      const zoom = map.current?.getZoom() || 13;
      setCurrentZoom(zoom);
      // Close cluster popover when zooming
      setSelectedCluster(null);
    });
    
    // Toggle focus mode and close cluster popover when clicking on map
    map.current.on('click', () => {
      setSelectedCluster(null);
      setFocusMode(prev => !prev);
    });

    // Track style loaded state for venue rendering
    map.current.on('style.load', () => {
      setStyleLoaded(true);
    });
    if (map.current.isStyleLoaded()) {
      setStyleLoaded(true);
    }

    // Handle flyTo from route state (e.g., private party tap)
    const flyToState = (location.state as any)?.flyTo;
    if (flyToState?.lat && flyToState?.lng) {
      const flyToCoords = flyToState;
      map.current.once('load', () => {
        map.current?.flyTo({
          center: [flyToCoords.lng, flyToCoords.lat],
          zoom: flyToCoords.zoom || 15,
          duration: 1500,
        });
      });
      // If already loaded, fly immediately
      if (map.current.loaded()) {
        map.current.flyTo({
          center: [flyToState.lng, flyToState.lat],
          zoom: flyToState.zoom || 15,
          duration: 1500,
        });
      }
      // Clear the state so it doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} });
    } else {
      // Initial load: center on the user's selected city, not raw GPS
      // (GPS may be in a different location than the city they're viewing)
    }

    const handleCenterMapOnVenue = (e: Event) => {
      const customEvent = e as CustomEvent<{ lat: number; lng: number }>;
      if (map.current && customEvent.detail) {
        map.current.flyTo({
          center: [customEvent.detail.lng, customEvent.detail.lat],
          zoom: 15,
          duration: 1500,
        });
      }
    };

    window.addEventListener('centerMapOnVenue', handleCenterMapOnVenue);

    return () => {
      window.removeEventListener('centerMapOnVenue', handleCenterMapOnVenue);
      // Clean up all markers using Map
      friendMarkersRef.current.forEach(marker => marker.remove());
      friendMarkersRef.current.clear();
      venueMarkersRef.current.forEach(marker => marker.remove());
      venueMarkersRef.current.clear();
      userMarkerRef.current?.remove();
      map.current?.remove();
    };
  }, []);

  // Re-center map when city changes
  useEffect(() => {
    if (!map.current) return;
    
    const cityCenter = CITY_CENTERS[city];
    map.current.flyTo({
      center: [cityCenter.lng, cityCenter.lat],
      zoom: 13,
      duration: 1500, // Smooth 1.5 second animation
    });
  }, [city]);

  // Add user's marker — only when both location AND profile are loaded
  // Hidden when user is merged into a friend cluster
  useEffect(() => {
    if (!map.current || !userLocation || !userProfile || userInCluster) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    // Remove old marker
    userMarkerRef.current?.remove();

    // Create user marker — same avatar system with a pulsing yellow ring
    const el = document.createElement('div');
    el.className = 'user-marker';
    el.style.width = `${MARKER.userSelf}px`;
    el.style.height = `${MARKER.userSelf}px`;
    el.style.cursor = 'pointer';
    el.style.zIndex = MARKER.zUser;

    const displayName = userProfile?.display_name || 'Me';

    el.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:-4px;border-radius:50%;background:radial-gradient(circle,rgba(212,255,0,0.15) 0%,transparent 70%);animation:pulse 2s infinite;"></div>
        ${personCircleHtml(userProfile?.avatar_url, displayName, '100%', 'close')}
      </div>
    `;

    // Add tap interaction to open profile page
    el.addEventListener('click', () => {
      navigate('/profile');
    });

    userMarkerRef.current = new mapboxgl.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
  }, [userLocation, userProfile, userInCluster]);

  // Smart marker diffing with clustering for groups
  // ~5 meters = 0.000045 degrees (venue-level accuracy)
  const CLUSTER_THRESHOLD = 0.000045;
  const SPREAD_RADIUS = 0.0002; // ~20m spread when expanded

  useEffect(() => {
    console.log('[DEBUG map] (6) marker effect: friends=', friends.length, 'isLoading=', isLoadingFriends, 'map=', !!map.current, 'layerVis=', layerVisibility);
    if (!map.current || isLoadingFriends) return;

    // Clear all markers first for clean re-render
    friendMarkersRef.current.forEach(marker => marker.remove());
    friendMarkersRef.current.clear();

    // If venues-only mode, don't render friend markers
    if (layerVisibility === 'venues') {
      return;
    }

    // Apply relationship filter, then filter out >60 min stale for markers
    const filteredByRelationship = relationshipFilter === 'close'
      ? friends.filter(f => f.relationshipType === 'close')
      : friends;

    // Only render markers for friends with location < 60 min old
    const filteredFriends = filteredByRelationship.filter(f => getStalenessMins(f.last_location_at) < 60);
    console.log('[DEBUG map] (7) filtered friends for markers:', filteredFriends.length, 'of', friends.length);

    // At high zoom (18+), don't cluster - show all individual avatars
    const shouldCluster = currentZoom < 18;

    // Group friends by location (within 5m threshold)
    const clusters: FriendLocation[][] = [];
    const assigned = new globalThis.Set<string>();

    filteredFriends.forEach((friend) => {
      if (assigned.has(friend.user_id)) return;

      const cluster = [friend];
      assigned.add(friend.user_id);

      if (shouldCluster) {
        filteredFriends.forEach((other) => {
          if (assigned.has(other.user_id)) return;

          // Cluster by same venue name (non-empty) OR by GPS proximity
          const sameVenue = friend.venue_name && other.venue_name
            && friend.venue_name.toLowerCase() === other.venue_name.toLowerCase();
          const latDiff = Math.abs(friend.lat - other.lat);
          const lngDiff = Math.abs(friend.lng - other.lng);
          const closeGps = latDiff < CLUSTER_THRESHOLD && lngDiff < CLUSTER_THRESHOLD;

          if (sameVenue || closeGps) {
            cluster.push(other);
            assigned.add(other.user_id);
          }
        });
      }

      clusters.push(cluster);
    });

    // Merge current user into a cluster if they overlap with any friend
    let mergedUserIntoCluster = false;
    if (shouldCluster && userLocation && userProfile && user) {
      for (const cluster of clusters) {
        const latDiff = Math.abs(cluster[0].lat - userLocation.lat);
        const lngDiff = Math.abs(cluster[0].lng - userLocation.lng);
        const closeGps = latDiff < CLUSTER_THRESHOLD && lngDiff < CLUSTER_THRESHOLD;
        const sameVenue = currentUserVenue && cluster[0].venue_name
          && currentUserVenue.toLowerCase() === cluster[0].venue_name.toLowerCase();
        if (closeGps || sameVenue) {
          // Insert "self" as first member of this cluster
          cluster.unshift({
            user_id: user.id,
            lat: userLocation.lat,
            lng: userLocation.lng,
            venue_name: cluster[0].venue_name,
            profiles: { display_name: userProfile.display_name, avatar_url: userProfile.avatar_url },
            relationshipType: 'close', // self gets highest priority ring
            last_location_at: new Date().toISOString(),
          });
          mergedUserIntoCluster = true;
          break;
        }
      }
    }
    setUserInCluster(mergedUserIntoCluster);

    // Z-index: friends always above venues
    const getZIndex = (relType?: string) => {
      if (relType === 'close') return MARKER.zFriendClose;
      if (relType === 'direct') return MARKER.zFriendDirect;
      return MARKER.zFriendMutual;
    };

    const getClusterZIndex = (cluster: FriendLocation[]) => {
      if (cluster.some(f => f.relationshipType === 'close')) return MARKER.zFriendClose;
      if (cluster.some(f => f.relationshipType === 'direct')) return MARKER.zFriendDirect;
      return MARKER.zFriendMutual;
    };

    // Sort cluster by priority: close > direct > mutual
    const sortByPriority = (a: FriendLocation, b: FriendLocation) => {
      const order = { close: 0, direct: 1, mutual: 2 };
      return (order[a.relationshipType || 'direct'] || 1) - (order[b.relationshipType || 'direct'] || 1);
    };

    // Helper to create a single person marker element
    const createPersonEl = (friend: FriendLocation): HTMLDivElement => {
      const el = document.createElement('div');
      el.className = 'friend-marker';
      el.style.width = `${MARKER.friendSolo}px`;
      el.style.height = `${MARKER.friendSolo}px`;
      el.style.cursor = 'pointer';
      el.style.zIndex = getZIndex(friend.relationshipType);

      const staleMins = getStalenessMins(friend.last_location_at);
      if (staleMins >= 15) el.style.opacity = '0.5';

      if (friend.is_private_party) {
        // House icon inside a ringed circle
        const ring = RING_COLORS[friend.relationshipType || 'direct'];
        const tooltip = friend.party_neighborhood
          ? `${escapeHtml(friend.profiles?.display_name)} — ${escapeHtml(friend.party_neighborhood)}`
          : escapeHtml(friend.profiles?.display_name);
        el.innerHTML = `
          <div style="position:relative;width:100%;height:100%;" title="${tooltip}">
            <div style="position:absolute;inset:0;border-radius:50%;border:${MARKER.ringWidth}px solid ${ring.border};box-shadow:0 0 8px ${ring.shadow};background:rgba(26,15,46,0.9);"></div>
            <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
                <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
            </div>
          </div>`;
      } else {
        el.innerHTML = personCircleHtml(
          friend.profiles?.avatar_url,
          friend.profiles?.display_name || 'user',
          '100%',
          friend.relationshipType || 'direct'
        );
      }

      el.addEventListener('click', () => {
        if (user && friend.user_id === user.id) {
          navigate('/profile');
        } else {
          openFriendCard({
            userId: friend.user_id,
            displayName: friend.profiles?.display_name || 'Friend',
            avatarUrl: friend.profiles?.avatar_url || null,
            venueName: friend.venue_name,
            lat: friend.lat,
            lng: friend.lng,
            relationshipType: friend.relationshipType,
          });
        }
      });
      return el;
    };

    // Render clusters
    clusters.forEach((cluster) => {
      const clusterKey = `cluster-${cluster.map(f => f.user_id).sort().join('-')}`;
      const centerLat = cluster[0].lat;
      const centerLng = cluster[0].lng;

      if (cluster.length >= 2 && shouldCluster) {
        // ── Group marker (unified for 2+) ──
        const sorted = [...cluster].sort(sortByPriority);
        const clusterZIndex = getClusterZIndex(cluster);

        const members = sorted.map(f => ({
          avatarUrl: f.profiles?.avatar_url,
          displayName: f.profiles?.display_name || 'U',
          relType: f.relationshipType || 'direct',
        }));

        const el = document.createElement('div');
        el.className = 'cluster-marker';
        const size = cluster.length <= 3 ? MARKER.friendGroup2_3 : MARKER.friendGroup4Plus;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.cursor = 'pointer';
        el.style.zIndex = clusterZIndex;

        el.innerHTML = groupMarkerHtml(members, cluster.length);

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const point = map.current!.project([centerLng, centerLat]);
          setSelectedCluster({
            friends: cluster,
            venueName: cluster[0].venue_name,
            screenX: point.x,
            screenY: point.y,
          });
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([centerLng, centerLat])
          .addTo(map.current!);

        friendMarkersRef.current.set(clusterKey, marker);
      } else {
        // ── Single person ──
        cluster.forEach((friend) => {
          const el = createPersonEl(friend);
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([friend.lng, friend.lat])
            .addTo(map.current!);
          friendMarkersRef.current.set(friend.user_id, marker);
        });
      }
    });
  }, [friends, isLoadingFriends, currentZoom, layerVisibility, relationshipFilter, userLocation, userProfile, user]);

  // Filter venues based on selected filter — clustering handles density
  const typeFilteredVenues = venueFilter === 'all' 
    ? venues 
    : venues.filter(v => v.type === venueFilter);
  
  const filteredVenues = typeFilteredVenues;

  // Render venue markers using Mapbox GL clustering for non-promoted venues
  // and DOM markers for promoted venues (special styling/z-index)
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    if (!styleLoaded) return;

    // If friends-only mode, remove everything
    if (layerVisibility === 'friends') {
      venueMarkersRef.current.forEach(marker => marker.remove());
      venueMarkersRef.current.clear();
      // Remove cluster layers/source if they exist
      if (m.getLayer('venue-cluster-count')) m.removeLayer('venue-cluster-count');
      if (m.getLayer('venue-clusters')) m.removeLayer('venue-clusters');
      if (m.getLayer('venue-unclustered')) m.removeLayer('venue-unclustered');
      if (m.getSource('venues-source')) m.removeSource('venues-source');
      return;
    }

    // Separate promoted vs non-promoted
    const promotedVenues = filteredVenues.filter(v => v.is_map_promoted);
    const nonPromotedVenues = filteredVenues.filter(v => !v.is_map_promoted);

    // Debug log promoted venues
    if (promotedVenues.length > 0) {
      console.log(`[map:promoted] Rendering ${promotedVenues.length} promoted venue(s):`, promotedVenues.map(v => v.name));
    }

    // === GeoJSON clustering for non-promoted venues ===
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: nonPromotedVenues.map((venue, index) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] },
        properties: {
          id: venue.id,
          name: venue.name,
          heatScore: venue.heatScore,
          isTopHot: index < 3 && venue.heatScore > 0,
        },
      })),
    };

    if (m.getSource('venues-source')) {
      // Update existing source data
      (m.getSource('venues-source') as mapboxgl.GeoJSONSource).setData(geojson);
    } else {
      // Add source with clustering
      m.addSource('venues-source', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles — muted so friends dominate
      m.addLayer({
        id: 'venue-clusters',
        type: 'circle',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#a855f7',
          'circle-radius': ['step', ['get', 'point_count'],
            MARKER.venueClusterRadii[0], 10,
            MARKER.venueClusterRadii[1], 50,
            MARKER.venueClusterRadii[2]],
          'circle-opacity': MARKER.venueClusterOpacity,
          'circle-stroke-width': MARKER.venueClusterStroke,
          'circle-stroke-color': MARKER.venueClusterStrokeColor,
        },
      });

      // Cluster count labels — floor at 11px so they stay legible after radius reduction
      m.addLayer({
        id: 'venue-cluster-count',
        type: 'symbol',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Create custom pin images for unclustered venues — smaller, muted
      if (!m.hasImage('venue-pin')) {
        const size = MARKER.venuePinSize;
        const yOffset = 6;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size + 14;
        const ctx = canvas.getContext('2d')!;

        // Teardrop/pin shape
        ctx.beginPath();
        ctx.moveTo(size / 2, size + 4 + yOffset);
        ctx.bezierCurveTo(size / 2 - 2, size - 4 + yOffset, 0, size / 2 + yOffset, 0, size / 2 - 4 + yOffset);
        ctx.arc(size / 2, size / 2 - 4 + yOffset, size / 2, Math.PI, 0, false);
        ctx.bezierCurveTo(size, size / 2 + yOffset, size / 2 + 2, size - 4 + yOffset, size / 2, size + 4 + yOffset);
        ctx.closePath();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // White dot in center
        ctx.beginPath();
        ctx.arc(size / 2, size / 2 - 4 + yOffset, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        m.addImage('venue-pin', { width: canvas.width, height: canvas.height, data: new Uint8Array(imgData.data.buffer) }, { pixelRatio: 2 });
      }

      // Individual unclustered pins — symbol layer with custom pin icon
      m.addLayer({
        id: 'venue-unclustered',
        type: 'symbol',
        source: 'venues-source',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': 'venue-pin',
          'icon-size': 1,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
        },
        paint: {
          'icon-opacity': ['case', ['>', ['get', 'heatScore'], 0], 0.8, 0.55],
        },
      });

      // Click handler for clusters - zoom in
      m.on('click', 'venue-clusters', (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['venue-clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = m.getSource('venues-source') as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coords = (features[0].geometry as GeoJSON.Point).coordinates;
          m.easeTo({ center: [coords[0], coords[1]] as [number, number], zoom: (zoom ?? 14) + 1 });
        });
      });

      // Click handler for individual pins
      m.on('click', 'venue-unclustered', (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['venue-unclustered'] });
        if (!features.length) return;
        const venueId = features[0].properties?.id;
        if (venueId) openVenueCard(venueId);
      });

      // Cursor styling
      m.on('mouseenter', 'venue-clusters', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'venue-clusters', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseenter', 'venue-unclustered', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'venue-unclustered', () => { m.getCanvas().style.cursor = ''; });
    }

    // === DOM markers for promoted venues only ===
    const currentPromotedIds = new globalThis.Set(promotedVenues.map(v => v.id));

    // Remove stale promoted markers
    venueMarkersRef.current.forEach((marker, venueId) => {
      if (!currentPromotedIds.has(venueId)) {
        marker.remove();
        venueMarkersRef.current.delete(venueId);
      }
    });

    // Add/update promoted venue markers
    promotedVenues.forEach((venue) => {
      const existing = venueMarkersRef.current.get(venue.id);
      if (existing) {
        existing.setLngLat([venue.lng, venue.lat]);
        return;
      }

      const el = document.createElement('div');
      el.className = 'venue-marker';
      el.style.width = `${MARKER.venuePromoted}px`;
      el.style.height = `${MARKER.venuePromoted}px`;
      el.style.cursor = 'pointer';
      el.style.zIndex = MARKER.zVenuePromoted;
      el.dataset.promoted = 'true';

      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <div class="promoted-halo" style="position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(212, 255, 0, 0.08) 0%, transparent 65%);"></div>
          <div style="width: ${MARKER.venuePromotedInner}px; height: ${MARKER.venuePromotedInner}px; background: rgba(168, 85, 247, 0.75); border-radius: 50%; box-shadow: 0 0 6px rgba(212, 255, 0, 0.1); display: flex; align-items: center; justify-content: center; border: 1.5px solid rgba(255, 255, 255, 0.6);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </div>
      `;

      el.addEventListener('click', () => openVenueCard(venue.id));

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([venue.lng, venue.lat])
        .addTo(m);

      const wrapper = marker.getElement()?.parentElement;
      if (wrapper) wrapper.style.zIndex = MARKER.zVenuePromoted;

      venueMarkersRef.current.set(venue.id, marker);
    });
  }, [filteredVenues, friends, layerVisibility, styleLoaded]);

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance.toFixed(1);
  };

  const toggleFriendsList = () => {
    if ((friendsOutData?.outFriends?.length ?? 0) > 0) {
      setShowFriendsList(!showFriendsList);
    }
  };

  const handleFriendClick = (friend: FriendLocation) => {
    // Center map on friend
    if (map.current) {
      map.current.flyTo({
        center: [friend.lng, friend.lat],
        zoom: 15,
        duration: 1500,
      });
    }
    // Open friend card
    const friendCardData: FriendCardData = {
      userId: friend.user_id,
      displayName: friend.profiles?.display_name || 'Friend',
      avatarUrl: friend.profiles?.avatar_url || null,
      venueName: friend.venue_name,
      lat: friend.lat,
      lng: friend.lng,
      relationshipType: friend.relationshipType,
    };
    openFriendCard(friendCardData);
  };

  // Get friends with distances sorted
  const friendsWithDistances = userLocation
    ? friends
        .map((friend) => ({
          ...friend,
          distance: calculateDistance(
            userLocation.lat,
            userLocation.lng,
            friend.lat,
            friend.lng
          ),
        }))
        .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
    : friends.map((friend) => ({ ...friend, distance: '--' }));

  // Handle click outside friends list
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        friendsListRef.current &&
        !friendsListRef.current.contains(event.target as Node) &&
        showFriendsList
      ) {
        setShowFriendsList(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFriendsList]);

  const centerOnMyLocation = async () => {
    if (!map.current) return;
    haptic.light();

    // Use cached location if fresh (< 60s)
    const isFresh = userLocation && (Date.now() - userLocationTimestampRef.current < 60_000);
    if (isFresh && userLocation) {
      map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 15.5, duration: 1200 });
      return;
    }

    // Request a fresh fix
    setIsLocating(true);
    try {
      const { getCurrentLocation } = await import('@/lib/location-service');
      const loc = await getCurrentLocation();
      if (loc.lat === 0 && loc.lng === 0) throw new Error('Zero coords');
      setUserLocation({ lat: loc.lat, lng: loc.lng });
      userLocationTimestampRef.current = Date.now();
      map.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 15.5, duration: 1200 });
    } catch {
      toast({
        title: "Couldn't find your location",
        description: "Turn on location services to use this feature",
        variant: "destructive"
      });
    } finally {
      setIsLocating(false);
    }
  };



  // Handle venue selection from search
  const handleVenueSearchSelect = (venue: Venue) => {
    if (map.current) {
      map.current.flyTo({
        center: [venue.lng, venue.lat],
        zoom: 16,
        duration: 1500,
      });
    }
    openVenueCard(venue.id);
    setShowSearchOverlay(false);
    setSearchQuery('');
  };

  // Handle friend selection from search
  const handleFriendSearchSelect = (friend: FriendLocation) => {
    if (map.current) {
      map.current.flyTo({
        center: [friend.lng, friend.lat],
        zoom: 15,
        duration: 1500,
      });
    }
    const friendCardData: FriendCardData = {
      userId: friend.user_id,
      displayName: friend.profiles?.display_name || 'Friend',
      avatarUrl: friend.profiles?.avatar_url || null,
      venueName: friend.venue_name,
      lat: friend.lat,
      lng: friend.lng,
      relationshipType: friend.relationshipType,
    };
    openFriendCard(friendCardData);
    setShowSearchOverlay(false);
    setSearchQuery('');
  };

  // Trending venues (top 3 by heat score)
  const trendingVenues = venues.slice(0, 3);

  // Venue type emoji helper
  const venueTypeIcon = (type: string) => {
    if (type === 'nightclub') return <Music className="h-4 w-4 text-[#a855f7]" />;
    if (type === 'cocktail_bar') return <Wine className="h-4 w-4 text-[#a855f7]" />;
    if (type === 'bar') return <Beer className="h-4 w-4 text-[#a855f7]" />;
    if (type === 'rooftop') return <Building className="h-4 w-4 text-[#a855f7]" />;
    return <MapPin className="h-4 w-4 text-[#d4ff00]" />;
  };

  // Filtered search results
  const searchPeopleResults = searchFilterPeople && searchQuery.length > 0
    ? friends.filter(f => f.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  const searchVenueResults = searchFilterVenues && searchQuery.length > 0
    ? venues.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()) || v.neighborhood.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10)
    : [];

  // Global user search — find non-friends by name or username
  const searchGlobalPeople = searchFilterPeople && searchQuery.trim().length >= 2 && cachedAllProfiles && cachedFriendIds && user
    ? (() => {
        const q = searchQuery.toLowerCase();
        const friendSet = new Set(cachedFriendIds);
        const friendResultIds = new Set(searchPeopleResults.map(f => f.user_id));
        return cachedAllProfiles
          .filter((p: any) =>
            p.id !== user.id &&
            !friendSet.has(p.id) &&
            !friendResultIds.has(p.id) &&
            (!demoEnabled ? !p.is_demo : true) &&
            (p.display_name?.toLowerCase().includes(q) ||
             p.username?.toLowerCase().includes(q))
          )
          .slice(0, 10);
      })()
    : [];

  // Bottom offset for floating elements (small padding above edge — nav is outside the map area)
  const bottomOffset = '5rem';
  const legendBottomOffset = '5rem';

  return (
    <div className="relative flex-1 w-full">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Header */}
      <div 
        className="absolute left-0 right-0 flex items-center justify-between px-6 py-4 z-20"
        style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-light tracking-[0.3em] text-white">Spotted</h1>
          <CityBadge />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/activity')}
            className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
            aria-label="View activity"
          >
            <Bell className="w-5 h-5" />
            <NotificationBadge count={unreadCount} />
          </button>
          <button 
            onClick={openCheckIn} 
            className="hover:scale-110 transition-transform"
          >
            <img src={spottedLogo} alt="Go live" className="h-10 w-10 object-contain" />
          </button>
        </div>
      </div>

      {/* Unified Search Bar */}
      <div 
        className={`absolute left-4 z-[200] flex items-center gap-2 transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ top: 'calc(5.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <button
          onClick={() => setShowSearchOverlay(true)}
          className="max-w-[260px] h-10 bg-black/50 backdrop-blur-md border border-white/15 rounded-full px-3 py-2 flex items-center gap-2 hover:bg-black/60 transition-all"
        >
          <Search className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
          <span className="text-white/50 text-xs flex-1 text-left truncate">Search people, venues...</span>
        </button>
        <button
          onClick={() => {
            if (layerVisibility === 'friends') {
              setLayerVisibility('both');
              setRelationshipFilter('all');
            } else {
              setLayerVisibility('friends');
              setRelationshipFilter('friends_only');
            }
          }}
          className={`h-10 rounded-full backdrop-blur-md border flex items-center gap-1.5 px-3 transition-all flex-shrink-0 ${
            layerVisibility === 'friends'
              ? 'bg-[#a855f7]/30 border-[#a855f7]/50 text-[#d4ff00]'
              : 'bg-black/50 border-white/15 text-white/70 hover:bg-black/60'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Friends</span>
        </button>
        <button
          onClick={() => setShowFilterSheet(true)}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center hover:bg-black/60 transition-colors flex-shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4 text-white/70" />
        </button>
      </div>

      {/* Smart Venue Prompt Banner (planning users near a venue) */}
      {showSmartPrompt && smartPromptVenue && !focusMode && (
        <div
          className="absolute left-4 right-4 z-[201] animate-fade-in"
          style={{ top: 'calc(8.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <div className="bg-gradient-to-r from-[#d4ff00]/20 to-[#a855f7]/20 backdrop-blur border border-[#d4ff00]/40 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-white text-sm font-medium">
                Looks like you're at <span className="text-[#d4ff00]">{smartPromptVenue.name || 'a venue nearby'}</span>
              </p>
              <p className="text-white/50 text-xs">Go live?</p>
            </div>
            <button
              onClick={() => {
                setShowSmartPrompt(false);
                openCheckIn();
              }}
              className="px-3 py-1.5 bg-[#d4ff00] text-[#0a0118] text-xs font-semibold rounded-full hover:bg-[#d4ff00]/90 transition-colors"
            >
              Share Location
            </button>
            <button
              onClick={() => {
                setShowSmartPrompt(false);
                smartPromptDismissedRef.current.add(smartPromptVenue.id);
              }}
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Banners area (venue move + planning ready) */}
      {!focusMode && (showVenueMoveBanner || showPlanningReady) && (
        <div
          className="absolute left-4 right-4 z-[202] space-y-2"
          style={{ top: showSmartPrompt && smartPromptVenue ? 'calc(12rem + env(safe-area-inset-top, 0px))' : 'calc(8.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {showVenueMoveBanner && venueShiftData && (
            <VenueMoveBanner
              venue={venueShiftData.venue}
              hasMultipleNearby={venueShiftData.hasMultipleNearby}
              onAccept={async () => {
                if (!user) return;
                setShowVenueMoveBanner(false);
                try {
                  await goOutAtVenue(user.id, {
                    venue: venueShiftData.venue,
                    coords: { lat: venueShiftData.lat, lng: venueShiftData.lng },
                    source: 'venue_shift',
                  });
                  toast({ title: `📍 Now at ${venueShiftData.venue.name}` });
                  fetchFriendsLocations();
                } catch (err) {
                  console.error('Venue move failed:', err);
                  toast({ variant: 'destructive', title: 'Failed to update venue' });
                }
              }}
              onDismiss={() => {
                setShowVenueMoveBanner(false);
                venueMoveDismissedRef.current = true;
              }}
              onSomewhereElse={() => {
                setShowVenueMoveBanner(false);
                setShowUpdateSpot(true);
              }}
            />
          )}
          {showPlanningReady && currentUserStatus === 'planning' && !(showSmartPrompt && smartPromptVenue) && (
            <PlanningReadyBanner
              onGoOut={() => {
                setShowPlanningReady(false);
                openCheckIn();
              }}
              onDismiss={() => setShowPlanningReady(false)}
            />
          )}
        </div>
      )}

      {/* Status Pill + Stop Sharing */}
      {currentUserStatus && !focusMode && (
        <div
          className="absolute left-4 z-[199] flex items-center gap-2 transition-opacity duration-300"
          style={{ top: (() => {
            let base = 8.5;
            if (showSmartPrompt && smartPromptVenue) base = 12;
            if (showVenueMoveBanner || showPlanningReady) base += 3.5;
            return `calc(${base}rem + env(safe-area-inset-top, 0px))`;
          })() }}
        >
          <button
            onClick={() => currentUserStatus === 'out' ? setShowUpdateSpot(true) : openCheckIn()}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md border transition-all hover:scale-105 bg-black/40 border-white/10 ${
              currentUserStatus === 'out'
                ? 'text-[#d4ff00]'
                : currentUserStatus === 'planning'
                ? 'text-[#a855f7]'
                : 'text-white/50'
            }`}
          >
            {currentUserStatus === 'out' ? (
              <>
                <MapPin className="w-3 h-3 fill-current" />
                <span className="text-[11px] font-medium">Out{currentUserVenue ? ` · ${currentUserVenue}` : ''}</span>
              </>
            ) : currentUserStatus === 'planning' ? (
              <>
                <Target className="w-3 h-3" />
                <span className="text-[11px] font-medium">TBD</span>
              </>
            ) : (
              <>
                <Home className="w-3 h-3" />
                <span className="text-[11px] font-medium">In</span>
              </>
            )}
          </button>

          {/* Stop Sharing button — visible when actively out */}
          {currentUserStatus === 'out' && (
            <button
              onClick={async () => {
                if (!user) return;
                const prevStatus = currentUserStatus;
                const prevVenue = currentUserVenue;
                try {
                  await stopSharing(user.id);

                  setCurrentUserStatus('home');
                  setCurrentUserVenue(null);
                  toast({ title: 'Location sharing stopped', description: 'Your friends can no longer see you.' });
                  fetchFriendsLocations();
                } catch (err) {
                  console.error('Stop sharing failed:', err);
                  setCurrentUserStatus(prevStatus);
                  setCurrentUserVenue(prevVenue);
                  toast({ variant: 'destructive', title: 'Failed to stop sharing' });
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md border border-white/10 bg-black/40 text-red-400 hover:bg-black/50 transition-all text-[11px] font-medium"
            >
              <MapPinOff className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>
      )}

      {/* Quick Status Sheet (for non-out statuses) */}
      <QuickStatusSheet
        open={showQuickStatus}
        onOpenChange={(open) => {
          setShowQuickStatus(open);
          if (!open) fetchFriendsLocations();
        }}
        suggestedVenue={showSmartPrompt ? smartPromptVenue : null}
      />

      {/* Update Spot Sheet (for out status — venue switching) */}
      <UpdateSpotSheet
        open={showUpdateSpot}
        onOpenChange={(open) => {
          setShowUpdateSpot(open);
          if (!open) fetchFriendsLocations();
        }}
        onUpdated={fetchFriendsLocations}
      />

      {/* Full-Screen Search Overlay */}
      {showSearchOverlay && (
        <div className="fixed inset-0 bg-[#110a24] z-[500] flex flex-col animate-fade-in pointer-events-auto" style={{ touchAction: 'auto' }}>
          {/* Search Header */}
          <div className="flex items-center gap-3 px-4 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
            <button 
              onClick={() => { setShowSearchOverlay(false); setSearchQuery(''); }}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1 bg-[#2d1b4e]/80 border border-[#a855f7]/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <Search className="w-4 h-4 text-white/40" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search people, venues, or neighborhoods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white text-sm flex-1 outline-none placeholder:text-white/40"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}>
                  <X className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex gap-2 px-4 pb-3">
            <button
              onClick={(e) => { e.stopPropagation(); setSearchFilterPeople(!searchFilterPeople); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                searchFilterPeople 
                  ? 'bg-[#a855f7]/30 text-white border border-[#a855f7]/50' 
                  : 'bg-[#2d1b4e]/50 text-white/50 border border-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              People
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSearchFilterVenues(!searchFilterVenues); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                searchFilterVenues 
                  ? 'bg-[#a855f7]/30 text-white border border-[#a855f7]/50' 
                  : 'bg-[#2d1b4e]/50 text-white/50 border border-white/10'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Venues
            </button>
          </div>

          {/* Search Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {searchQuery.length === 0 ? (
              <>
                {/* Trending Tonight */}
                {searchFilterVenues && trendingVenues.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Trending Tonight</h3>
                    <div className="space-y-1">
                      {trendingVenues.map((venue) => (
                        <button
                          key={venue.id}
                          onClick={() => handleVenueSearchSelect(venue)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <span className="flex items-center">{venueTypeIcon(venue.type)}</span>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{venue.name}</p>
                            <p className="text-white/40 text-xs">{venue.neighborhood}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Friends Out Now */}
                {searchFilterPeople && friends.length > 0 && (
                  <div>
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Friends Out Now</h3>
                    <div className="space-y-1">
                      {friends.map((friend) => {
                        const staleMins = getStalenessMins(friend.last_location_at);
                        return (
                        <button
                          key={friend.user_id}
                          onClick={() => handleFriendSearchSelect(friend)}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors ${staleMins >= 60 ? 'opacity-50' : ''}`}
                        >
                          <Avatar className="w-9 h-9 border-2 border-[#a855f7]/40">
                            <AvatarImage src={friend.profiles?.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                              {friend.profiles?.display_name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{friend.profiles?.display_name}</p>
                            <p className="text-[#d4ff00] text-xs">{friend.venue_name ? `At ${friend.venue_name}` : 'Out now'}</p>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* People Results */}
                {searchFilterPeople && searchPeopleResults.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">People</h3>
                    <div className="space-y-1">
                      {searchPeopleResults.map((friend) => {
                        return (
                        <button
                          key={friend.user_id}
                          onClick={() => handleFriendSearchSelect(friend)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <Avatar className="w-9 h-9 border-2 border-[#a855f7]/40">
                            <AvatarImage src={friend.profiles?.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                              {friend.profiles?.display_name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{friend.profiles?.display_name}</p>
                            <p className="text-[#d4ff00] text-xs">{friend.venue_name ? `At ${friend.venue_name}` : 'Out now'}</p>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Venue Results */}
                {searchFilterVenues && searchVenueResults.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Venues</h3>
                    <div className="space-y-1">
                      {searchVenueResults.map((venue) => (
                        <button
                          key={venue.id}
                          onClick={() => handleVenueSearchSelect(venue)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <span className="flex items-center">{venueTypeIcon(venue.type)}</span>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{venue.name}</p>
                            <p className="text-white/40 text-xs">{venue.neighborhood}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add People — non-friend results */}
                {searchFilterPeople && searchGlobalPeople.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Add People</h3>
                    <div className="space-y-1">
                      {searchGlobalPeople.map((person: any) => (
                        <button
                          key={person.id}
                          onClick={() => {
                            setShowSearchOverlay(false);
                            setSearchQuery('');
                            openFriendCard({
                              userId: person.id,
                              displayName: person.display_name,
                              avatarUrl: person.avatar_url,
                            });
                          }}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <Avatar className="w-9 h-9 border-2 border-white/10">
                            <AvatarImage src={person.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                              {person.display_name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-white font-medium text-sm truncate">{person.display_name}</p>
                            <p className="text-white/40 text-xs truncate">@{person.username}</p>
                          </div>
                          <span className="flex items-center gap-1 text-[#a855f7] text-xs font-medium">
                            <UserPlus className="w-3.5 h-3.5" />
                            Add
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results */}
                {searchPeopleResults.length === 0 && searchVenueResults.length === 0 && searchGlobalPeople.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-white/40 text-sm">No results found</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick Filter Bottom Sheet */}
      <Drawer open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <DrawerContent className="bg-[#1a0f2e] border-[#a855f7]/30">
          <DrawerHeader>
            <DrawerTitle className="text-white">Show on Map</DrawerTitle>
          </DrawerHeader>
          <div className="px-6 pb-6 space-y-6">
            {/* Relationship Filter */}
            <div className="space-y-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">People</p>
              <RadioGroup 
                value={relationshipFilter} 
                onValueChange={(val) => {
                  setRelationshipFilter(val as 'all' | 'close' | 'friends_only');
                  if (val === 'friends_only') {
                    setLayerVisibility('friends');
                  } else {
                    setLayerVisibility('both');
                  }
                  setShowFilterSheet(false);
                }}
                className="space-y-2"
              >
                {[
                  { value: 'all', label: 'Everyone', desc: 'Show all friends & venues' },
                  { value: 'close', label: 'Close Friends Only', desc: 'Only close friends, still show venues' },
                  { value: 'friends_only', label: 'Friends Only', desc: 'Hide venue pins' },
                ].map((opt) => (
                  <Label
                    key={opt.value}
                    htmlFor={`filter-${opt.value}`}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      relationshipFilter === opt.value 
                        ? 'bg-[#a855f7]/20 border border-[#a855f7]/40' 
                        : 'bg-[#2d1b4e]/50 border border-transparent hover:bg-[#2d1b4e]/80'
                    }`}
                  >
                    <RadioGroupItem value={opt.value} id={`filter-${opt.value}`} className="border-[#a855f7] text-[#a855f7]" />
                    <div>
                      <p className="text-white text-sm font-medium">{opt.label}</p>
                      <p className="text-white/40 text-xs">{opt.desc}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Venue Type Filter */}
            <div className="space-y-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Venue Type</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'all', label: 'All Venues', icon: <MapIcon className="h-4 w-4" /> },
                  { key: 'nightclub', label: 'Clubs', icon: <Music className="h-4 w-4" /> },
                  { key: 'cocktail_bar', label: 'Cocktails', icon: <Wine className="h-4 w-4" /> },
                  { key: 'bar', label: 'Bars', icon: <Beer className="h-4 w-4" /> },
                  { key: 'restaurant', label: 'Restaurants', icon: <UtensilsCrossed className="h-4 w-4" /> },
                  { key: 'rooftop', label: 'Rooftops', icon: <Building className="h-4 w-4" /> },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => {
                      setVenueFilter(filter.key as typeof venueFilter);
                      setShowFilterSheet(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      venueFilter === filter.key
                        ? 'bg-[#a855f7]/25 text-[#d4ff00] font-semibold border border-[#a855f7]/40'
                        : 'bg-[#2d1b4e]/50 text-white/70 border border-transparent hover:bg-[#2d1b4e]/80'
                    }`}
                  >
                    <span>{filter.icon}</span>
                    <span>{filter.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Friends Out Pill + List - Bottom Left - Hidden in venues-only mode */}
      {layerVisibility !== 'venues' && (friendsOutData?.outFriends?.length ?? 0) > 0 ? (
        <div ref={friendsListRef} className={`absolute left-6 z-[200] max-w-sm transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ bottom: bottomOffset }}>
          {/* Expanded Friends List - Opens Upward */}
          {showFriendsList && (
            <div className="mb-2 bg-[#1a0a2e]/95 backdrop-blur border border-white/10 rounded-2xl max-h-96 overflow-y-auto relative z-[200]">
              {/* Friends Out Section — grouped by relationship */}
              {(() => {
                const ringOrder: Array<{ key: 'close' | 'direct' | 'mutual'; label: string }> = [
                  { key: 'close', label: 'Close Friends' },
                  { key: 'direct', label: 'Friends' },
                  { key: 'mutual', label: 'Mutual Friends' },
                ];
                const groups = ringOrder.map(({ key, label }) => ({
                  key,
                  label,
                  friends: friendsWithDistances.filter(f => (f.relationshipType || 'direct') === key),
                })).filter(g => g.friends.length > 0);
                const showHeaders = groups.length > 1;

                return groups.map(({ key, label, friends: groupFriends }) => (
                  <div key={key}>
                    {showHeaders && (
                      <div className="px-3 py-1.5 bg-white/[0.03] border-y border-[#a855f7]/10">
                        <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">
                          {label} · {groupFriends.length}
                        </p>
                      </div>
                    )}
                    {groupFriends.map((friend) => {
                      const staleMins = getStalenessMins(friend.last_location_at);
                      const isVeryStale = staleMins >= 60;
                      return (
                        <button
                          key={friend.user_id}
                          onClick={() => handleFriendClick(friend)}
                          className={`w-full flex items-center gap-3 p-3 pressable-row border-b border-[#a855f7]/10 ${isVeryStale ? 'opacity-50' : ''}`}
                        >
                          <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50 relative">
                            <AvatarImage src={friend.profiles?.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                              {friend.profiles?.display_name?.[0] || '?'}
                            </AvatarFallback>
                            {friend.relationshipType === 'close' && (
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1a0f2e] border-2 border-[#d4ff00] rounded-full flex items-center justify-center text-xs">
                                💛
                              </div>
                            )}
                            {friend.relationshipType === 'mutual' && (
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1a0f2e] border-2 border-[#6366f1] rounded-full flex items-center justify-center text-xs">
                                🔗
                              </div>
                            )}
                          </Avatar>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-white font-semibold text-sm truncate">
                              {friend.profiles?.display_name || 'Unknown'}
                            </p>
                            <p className="text-[#d4ff00] text-xs truncate">
                              {friend.venue_name ? `At ${friend.venue_name}` : 'Out now'}
                            </p>
                          </div>
                          <span className="text-white/60 text-xs flex-shrink-0">
                            {friend.distance} mi
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}

              {/* Friends Planning Section — use shared hook data, exclude anyone already shown as "out" */}
              {(() => {
                const outUserIds = new globalThis.Set(friends.map(f => f.user_id));
                const hookPlanning = friendsOutData?.planningFriends || [];
                const filteredPlanningFriends = hookPlanning.filter(f => !outUserIds.has(f.user_id));
                if (filteredPlanningFriends.length === 0) return null;

                const tbdRingOrder: Array<{ key: string; label: string }> = [
                  { key: 'close', label: 'Close Friends' },
                  { key: 'friend', label: 'Friends' },
                  { key: 'mutual', label: 'Mutual Friends' },
                ];
                const tbdGroups = tbdRingOrder.map(({ key, label }) => ({
                  key,
                  label,
                  friends: filteredPlanningFriends.filter(f => (f.ring || 'friend') === key),
                })).filter(g => g.friends.length > 0);
                const showTbdHeaders = tbdGroups.length > 1;

                return (
                <>
                  {/* TBD divider */}
                  <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
                    <p className="text-white/70 text-xs font-medium flex items-center gap-1.5">
                      TBD tonight
                      <span className="text-white/50">({filteredPlanningFriends.length})</span>
                    </p>
                  </div>

                  {tbdGroups.map(({ key, label, friends: groupFriends }) => (
                    <div key={`tbd-${key}`}>
                      {showTbdHeaders && (
                        <div className="px-3 py-1.5 bg-white/[0.03] border-y border-[#a855f7]/10">
                          <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">
                            {label} · {groupFriends.length}
                          </p>
                        </div>
                      )}
                      {groupFriends.map((friend) => (
                        <button
                          key={friend.user_id}
                          onClick={() => {
                            const friendCardData: FriendCardData = {
                              userId: friend.user_id,
                              displayName: friend.display_name || 'Friend',
                              avatarUrl: friend.avatar_url || null,
                              venueName: null,
                              lat: undefined,
                              lng: undefined,
                              relationshipType: undefined,
                            };
                            openFriendCard(friendCardData);
                            setShowFriendsList(false);
                          }}
                          className="w-full flex items-center gap-3 p-3 pressable-row border-b border-[#a855f7]/10 last:border-b-0"
                        >
                          <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                              {friend.display_name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-white font-semibold text-sm truncate">
                              {friend.display_name || 'Unknown'}
                            </p>
                            <p className="text-[#a855f7] text-xs truncate">
                              TBD{friend.planning_neighborhood ? ` · ${friend.planning_neighborhood}` : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
                );
              })()}
            </div>
          )}

          {/* Clickable Pill */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFriendsList(); }}
            className="bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 hover:bg-[#2d1b4e] transition-colors w-full"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
              <span className="text-white/80 text-sm">{friendsOutData?.outFriends?.length ?? 0} friends out</span>
              <ChevronDown className={`w-4 h-4 text-white/60 transition-transform duration-200 ${showFriendsList ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </div>
      ) : layerVisibility !== 'venues' && !demoEnabled ? (
        <div className={`absolute left-6 bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 z-20 transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ bottom: bottomOffset }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#a855f7]/30 rounded-full"></div>
            <span className="text-white/60 text-sm">
              {(friendsOutData?.planningFriends?.length ?? 0) > 0
                ? `${friendsOutData!.planningFriends.length} friend${friendsOutData!.planningFriends.length === 1 ? '' : 's'} TBD`
                : 'No friends out'}
            </span>
          </div>
        </div>
      ) : null}


      {/* My Location Button */}
      <button
        onClick={centerOnMyLocation}
        disabled={isLocating}
        className={`absolute right-6 w-12 h-12 rounded-full bg-[#1a0a2e]/90 backdrop-blur border border-white/15 flex items-center justify-center z-20 hover:bg-[#1a0a2e] transition-all duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ bottom: bottomOffset }}
        aria-label="Center on my location"
      >
        {isLocating
          ? <Loader2 className="w-5 h-5 text-[#d4ff00] animate-spin" />
          : <Crosshair className={`w-5 h-5 ${userLocation ? 'text-[#d4ff00]' : 'text-white'}`} />
        }
      </button>

      {/* Legend - Hidden in venues-only mode */}
      {layerVisibility !== 'venues' && (
        <div className={`absolute right-6 bg-[#1a0a2e]/95 backdrop-blur-sm border border-white/10 rounded-xl p-2 z-20 transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ bottom: legendBottomOffset }}>
        <p className="text-white/70 text-[10px] font-medium mb-1.5">Relationship</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-[1.5px] border-[#d4ff00] flex items-center justify-center text-[6px] bg-[#1a0f2e]">
              💛
            </div>
            <span className="text-white/60 text-[10px]">Close</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-[1.5px] border-purple-600 bg-[#1a0f2e]"></div>
            <span className="text-white/60 text-[10px]">Friend</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-[1.5px] border-[#6366f1] flex items-center justify-center text-[6px] bg-[#1a0f2e]">
              🔗
            </div>
            <span className="text-white/60 text-[10px]">Mutual</span>
          </div>
        </div>
        </div>
      )}

      {/* Cluster Friends Popover */}
      {selectedCluster && (
        <div 
          className="absolute z-[300] bg-[#1a0a2e]/95 backdrop-blur border border-white/10 rounded-2xl overflow-hidden animate-fade-in"
          style={{
            left: Math.min(
              Math.max(selectedCluster.screenX - 120, 10),
              window.innerWidth - 260
            ),
            top: selectedCluster.screenY + 300 > window.innerHeight 
              ? Math.max(selectedCluster.screenY - 280, 80)
              : selectedCluster.screenY + 40,
            minWidth: '240px',
            maxWidth: '280px',
            maxHeight: 'calc(100vh - 160px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[#a855f7]/20">
            <h3 className="text-white font-medium text-sm">
              {selectedCluster.venueName ? `Friends at ${selectedCluster.venueName}` : 'Friends out'}
            </h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {selectedCluster.friends.map((friend) => (
              <button
                key={friend.user_id}
                onClick={() => {
                  setSelectedCluster(null);
                  if (user && friend.user_id === user.id) {
                    navigate('/profile');
                  } else {
                    const friendCardData: FriendCardData = {
                      userId: friend.user_id,
                      displayName: friend.profiles?.display_name || 'Friend',
                      avatarUrl: friend.profiles?.avatar_url || null,
                      venueName: friend.venue_name,
                      lat: friend.lat,
                      lng: friend.lng,
                      relationshipType: friend.relationshipType,
                    };
                    openFriendCard(friendCardData);
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#a855f7]/10 transition-colors"
              >
                <Avatar className="h-10 w-10 border-2 border-[#a855f7]/50">
                  <AvatarImage 
                    src={friend.profiles?.avatar_url || undefined} 
                    alt={friend.profiles?.display_name} 
                  />
                  <AvatarFallback className="bg-[#a855f7]/20 text-white">
                    {friend.profiles?.display_name?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white font-medium text-sm flex-1 text-left">
                  {user && friend.user_id === user.id ? 'You' : friend.profiles?.display_name}
                </span>
                <ChevronDown className="w-4 h-4 text-white/40 -rotate-90" />
              </button>
            ))}
          </div>
        </div>
      )}

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
  );
}
