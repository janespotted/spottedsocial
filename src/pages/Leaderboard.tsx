import { useEffect, useState } from 'react';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useUserCity } from '@/hooks/useUserCity';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { useFriendIds } from '@/hooks/useFriendIds';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PageHeader } from '@/components/PageHeader';
import { ChevronUp, ChevronDown, BarChart3, ChevronRight } from 'lucide-react';
import { FriendSearchModal } from '@/components/FriendSearchModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { LeaderboardSkeleton } from '@/components/LeaderboardSkeleton';
import { isVenueOpen, VenueHours } from '@/lib/venue-hours';
import { isNightlifeHours } from '@/lib/time-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CITY_NEIGHBORHOODS, getCityLabel } from '@/lib/city-neighborhoods';
interface VenueStats {
  venue_name: string;
  venue_id: string | null;
  neighborhood: string | null;
  count: number;
  rank: number;
  movement: 'up' | 'down' | 'same';
  friends: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
  }[];
  energyLevel: number;
  isPromoted?: boolean;
  isNewlyOpened?: boolean;
  operatingHours?: VenueHours | null;
  recentCheckinCount: number; // Check-ins in last 30 mins for velocity
}

interface BiggestMover {
  venue_name: string;
  venue_id: string | null;
  friends: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
  }[];
}

export default function Leaderboard() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();
  const { city } = useUserCity();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  useAutoVenueTracking();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const [venues, setVenues] = useState<VenueStats[]>([]);
  const [biggestMover, setBiggestMover] = useState<BiggestMover | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [showFriendSearch, setShowFriendSearch] = useState(false);

  // Reset neighborhood filter when city changes
  useEffect(() => {
    setSelectedNeighborhood(null);
  }, [city]);

  const calculateEnergyLevel = (
    rank: number, 
    userCount: number, 
    isBootstrapMode: boolean
  ): number => {
    if (!isBootstrapMode) {
      // Production mode: Based on actual check-in counts
      if (userCount >= 10) return 3;
      if (userCount >= 5) return 2;
      return userCount > 0 ? 1 : 0;
    }
    
    // Bootstrap mode: Based on leaderboard ranking position
    if (rank <= 7) return 3;   // Top tier (ranks 1-7)
    if (rank <= 14) return 2;  // Mid tier (ranks 8-14)
    return 1;                  // Lower tier (ranks 15+)
  };

  const handleVenueClick = async (venueName: string, venueId?: string | null) => {
    if (venueId) {
      openVenueCard(venueId);
      return;
    }

    // If no venue_id, look it up by name
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();

    if (data?.id) {
      openVenueCard(data.id);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLeaderboard();
    }
  }, [user, demoEnabled, bootstrapEnabled, city, selectedNeighborhood, cachedFriendIds]);

  // Auto-refresh on tab/app return
  useVisibilityRefresh(() => {
    if (user) fetchLeaderboard();
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetchLeaderboard();
      }, 1500);
    };
    const channel = supabase
      .channel('leaderboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      // Build query for night statuses with venue popularity_rank, filtered by city
      // NOTE: profiles join is done separately to avoid silent null from embedded joins
      let query = supabase
        .from('night_statuses')
        .select(`
          venue_name,
          venue_id,
          user_id,
          updated_at,
          is_promoted,
          is_demo,
          venues!inner(popularity_rank, is_leaderboard_promoted, city, opened_at, operating_hours, neighborhood)
        `)
        .eq('venues.city', city)
        .not('venue_name', 'is', null)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString());

      // Apply neighborhood filter if selected
      if (selectedNeighborhood) {
        query = query.eq('venues.neighborhood', selectedNeighborhood);
      }

      // Only show demo data when demo mode is explicitly ON
      if (!demoEnabled) {
        query = query.eq('is_demo', false);
      }

      // Parallelize: fetch promoted venues AND night statuses at the same time
      // Fetch promoted venues ordered by leaderboard_promo_order (active spots are order 1-2)
      let promotedQuery = supabase
        .from('venues')
        .select('id, name, popularity_rank, is_leaderboard_promoted, leaderboard_promo_order, opened_at, neighborhood, operating_hours, city')
        .eq('is_leaderboard_promoted', true)
        .eq('city', city)
        .not('leaderboard_promo_order', 'is', null)
        .lte('leaderboard_promo_order', 2)
        .order('leaderboard_promo_order', { ascending: true });
      if (selectedNeighborhood) {
        promotedQuery = promotedQuery.eq('neighborhood', selectedNeighborhood);
      }

      // In demo/bootstrap mode, fetch top venues to ensure leaderboard is always populated
      let topVenuesQuery = null;
      if (demoEnabled || bootstrapEnabled) {
        if (selectedNeighborhood) {
          // Fetch ALL venues in the selected neighborhood
          topVenuesQuery = supabase
            .from('venues')
            .select('id, name, neighborhood, popularity_rank, is_leaderboard_promoted, opened_at, operating_hours')
            .eq('city', city)
            .eq('neighborhood', selectedNeighborhood)
            .order('popularity_rank', { ascending: true });
        } else {
          // Fetch top 30 venues city-wide by popularity_rank (ensures 20 always show)
          topVenuesQuery = supabase
            .from('venues')
            .select('id, name, neighborhood, popularity_rank, is_leaderboard_promoted, opened_at, operating_hours')
            .eq('city', city)
            .order('popularity_rank', { ascending: true })
            .limit(30);
        }
      }

      const [promotedVenuesResult, statusesResult, topVenuesResult] = await Promise.all([
        promotedQuery,
        query,
        topVenuesQuery,
      ]);

      const promotedVenues = promotedVenuesResult.data;
      const statuses = statusesResult.data;
      const topVenues = topVenuesResult?.data;

      // Fetch profiles via RPC (direct profiles table is blocked by RLS for non-own profiles)
      const { data: allProfileRows } = await supabase.rpc('get_profiles_safe');
      const leaderboardProfileMap = new Map<string, any>();
      for (const p of (allProfileRows || [])) {
        leaderboardProfileMap.set(p.id, p);
      }

    // Build a set of active promoted venue IDs (only order 1-2)
    const activePromotedIds = new Set(promotedVenues?.map(v => v.id) || []);

    // Calculate if venue is newly opened (within last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Calculate 30 minutes ago for velocity tracking
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Group by venue, including popularity_rank
    const venueMap = new Map<string, VenueStats & { popularity_rank: number }>();
    
    // In demo/bootstrap mode, pre-populate venues from the top venues query
    // This ensures leaderboard always shows 20 venues even with 0 check-ins
    if ((demoEnabled || bootstrapEnabled) && topVenues) {
      topVenues.forEach((venue, index) => {
        const isNewlyOpened = venue.opened_at 
          ? new Date(venue.opened_at) > threeMonthsAgo 
          : false;
        
        // Calculate energy level based on ranking position
        const rank = index + 1;
        let energyLevel = 1;
        if (rank <= 7) energyLevel = 3;
        else if (rank <= 14) energyLevel = 2;
        
        venueMap.set(venue.name, {
          venue_name: venue.name,
          venue_id: venue.id,
          neighborhood: (venue as any).neighborhood || null,
          count: 0,
          rank,
          movement: 'same',
          friends: [],
          energyLevel,
          isPromoted: venue.is_leaderboard_promoted,
          isNewlyOpened,
          popularity_rank: venue.popularity_rank || 999,
          operatingHours: (venue as any).operating_hours as VenueHours | null,
          recentCheckinCount: 0,
        });
      });
    }
    
    // Add ONLY active promoted venues (order 1-2) to ensure they appear
    promotedVenues?.forEach((venue: any) => {
      if (venueMap.has(venue.name)) return; // Skip if already added from neighborhood venues
      
      const isNewlyOpened = venue.opened_at 
        ? new Date(venue.opened_at) > threeMonthsAgo 
        : false;
      
      venueMap.set(venue.name, {
        venue_name: venue.name,
        venue_id: venue.id,
        neighborhood: venue.neighborhood || null,
        count: 0,
        rank: 0,
        movement: 'same',
        friends: [],
        energyLevel: 1,
        isPromoted: true,
        isNewlyOpened,
        popularity_rank: venue.popularity_rank || 999,
        operatingHours: (venue as any).operating_hours as VenueHours | null,
        recentCheckinCount: 0,
      });
    });
    
    // Then process night statuses
    statuses?.forEach((status: any) => {
      const venueName = status.venue_name;
      const venueId = status.venue_id;
      const isPromoted = status.venues?.is_leaderboard_promoted || false;
      const popularityRank = status.venues?.popularity_rank || 999;
      // Only mark as promoted if it's in the active spots (order 1-2)
      const isActivelyPromoted = activePromotedIds.has(venueId);
      const openedAt = status.venues?.opened_at;
      const operatingHours = status.venues?.operating_hours as VenueHours | null;
      const isNewlyOpened = openedAt 
        ? new Date(openedAt) > threeMonthsAgo 
        : false;
      const statusProfile = leaderboardProfileMap.get(status.user_id);
      const isDemo = statusProfile?.is_demo || status.is_demo || false;
      const updatedAt = status.updated_at ? new Date(status.updated_at) : null;
      const isRecentCheckin = updatedAt && updatedAt > thirtyMinutesAgo;
      
      if (!venueMap.has(venueName)) {
        venueMap.set(venueName, {
          venue_name: venueName,
          venue_id: venueId,
          neighborhood: status.venues?.neighborhood || null,
          count: 0,
          rank: 0,
          movement: 'same',
          friends: [],
          energyLevel: 0,
          isPromoted: isActivelyPromoted,
          isNewlyOpened,
          popularity_rank: popularityRank,
          operatingHours,
          recentCheckinCount: 0,
        });
      }
      
      const venue = venueMap.get(venueName)!;
      venue.count++; // Count ALL users (including demo) for energy calculation
      
      // Track recent check-ins for velocity calculation
      if (isRecentCheckin) {
        venue.recentCheckinCount++;
      }
      
      // Store operating hours if not already set
      if (!venue.operatingHours && operatingHours) {
        venue.operatingHours = operatingHours;
      }
      
      // Only show avatars for the current user's friends (close, direct, mutual)
      const friendIdSet = cachedFriendIds || [];
      if (status.user_id !== user?.id && friendIdSet.includes(status.user_id)) {
        venue.friends.push({
          user_id: status.user_id,
          display_name: statusProfile?.display_name || statusProfile?.username || 'Anonymous',
          avatar_url: statusProfile?.avatar_url || null,
        });
      }
    });

    // Convert to array and separate promoted from non-promoted
    const venueArray = Array.from(venueMap.values());
    
    // Filter out closed venues - only show open venues on leaderboard
    // EXCEPT promoted venues which always appear (paid placement guarantee)
    const openVenueArray = venueArray.filter(v => {
      // Promoted venues always appear regardless of operating hours
      if (v.isPromoted) return true;
      // If no operating hours data, only show during nightlife hours (11am-5am)
      if (!v.operatingHours) return isNightlifeHours();
      return isVenueOpen(v.operatingHours);
    });
    
    // Get all promoted venues that are OPEN and sort by count desc, then popularity_rank asc
    const allPromotedVenues = openVenueArray.filter(v => v.isPromoted);
    // Already filtered to only active spots (order 1-2) in query, just sort by popularity
    allPromotedVenues.sort((a, b) => a.popularity_rank - b.popularity_rank);
    
    // Use all promoted venues (already limited to 2 active spots by query filter)
    const topPromotedVenues = allPromotedVenues;
    
    // Get all non-promoted venues that are OPEN and sort by count desc, then popularity_rank asc
    const nonPromotedVenues = openVenueArray.filter(v => !v.isPromoted);
    nonPromotedVenues.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.popularity_rank - b.popularity_rank;
    });
    
    // Take top 20 non-promoted venues for ranking (user requested top 20)
    const rankedVenues = nonPromotedVenues.slice(0, 20).map((venue, index) => {
      const rank = index + 1;
      return {
        ...venue,
        rank,
        movement: Math.random() > 0.5 ? 'up' : (Math.random() > 0.5 ? 'down' : 'same') as 'up' | 'down' | 'same',
        energyLevel: calculateEnergyLevel(rank, venue.count, bootstrapEnabled),
      };
    });

    // Assign properties to promoted venues (no rank, treat as top tier for energy)
    const promotedWithProps = topPromotedVenues.map(venue => ({
      ...venue,
      rank: 0, // No rank for promoted
      movement: 'same' as const,
      energyLevel: calculateEnergyLevel(1, venue.count, bootstrapEnabled), // Treat as rank 1 for energy
    }));

    // Combine: promoted first, then ranked
    const finalVenues = [...promotedWithProps, ...rankedVenues];

    setVenues(finalVenues);

      // Set biggest mover with fallback logic for demo/bootstrap mode
      // Priority 1: Open venues with recent velocity (check-ins in last 30 mins)
      const openVenuesWithVelocity = nonPromotedVenues
        .filter(venue => isVenueOpen(venue.operatingHours || null))
        .filter(v => v.recentCheckinCount > 0)
        .sort((a, b) => b.recentCheckinCount - a.recentCheckinCount);

      // Priority 2: Open venues with any activity
      const openVenuesWithActivity = nonPromotedVenues
        .filter(venue => isVenueOpen(venue.operatingHours || null))
        .filter(v => v.count > 0)
        .sort((a, b) => b.count - a.count);

      // Priority 3: Any venue with activity (fallback for demo/bootstrap when no venues are "open")
      const anyVenueWithActivity = nonPromotedVenues
        .filter(v => v.count > 0)
        .sort((a, b) => b.count - a.count);

      // Priority 4: In demo/bootstrap mode, use top-ranked venue from pre-populated list
      const topNeighborhoodVenue = (bootstrapEnabled || demoEnabled) && topVenues?.[0]
        ? {
            venue_name: topVenues[0].name,
            venue_id: topVenues[0].id,
            friends: [] as { user_id: string; display_name: string; avatar_url: string | null }[],
          }
        : null;

      // Select mover venue with fallback chain
      const moverVenue = openVenuesWithVelocity[0] 
        || openVenuesWithActivity[0] 
        || ((bootstrapEnabled || demoEnabled) ? anyVenueWithActivity[0] : null)
        || topNeighborhoodVenue;

      if (moverVenue) {
        setBiggestMover({
          venue_name: moverVenue.venue_name,
          venue_id: moverVenue.venue_id,
          friends: 'friends' in moverVenue ? moverVenue.friends.slice(0, 3) : [],
        });
      } else {
        setBiggestMover(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Max count across all ranked venues — used for relative activity bars
  const maxCount = venues.filter(v => !v.isPromoted).reduce((max, v) => Math.max(max, v.count), 1);

  // Shared friend popover for a venue
  const renderFriendPopover = (venue: { venue_name: string; friends: VenueStats['friends'] }) => {
    if (venue.friends.length === 0) return null;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center cursor-pointer hover:opacity-90 transition-opacity">
            <div className="flex -space-x-2">
              {venue.friends.slice(0, 3).map((friend, idx) => (
                <Avatar key={idx} className="h-7 w-7 border-2 border-[#1e1338]">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#a855f7] text-white text-[10px]">
                    {friend.display_name[0]}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {venue.friends.length > 3 && (
              <span className="ml-1.5 text-xs text-white/60 font-medium">
                +{venue.friends.length - 3}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl" align="end">
          <p className="text-white/60 text-xs px-2 mb-2">Friends at {venue.venue_name}</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {venue.friends.map((friend, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  openFriendCard({
                    userId: friend.user_id,
                    displayName: friend.display_name,
                    avatarUrl: friend.avatar_url,
                    venueName: venue.venue_name,
                  });
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[#a855f7]/20 transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                    {friend.display_name[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white text-sm flex-1 text-left">{friend.display_name}</span>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Venue card — adapts styling based on rank tier
  const renderVenueCard = (venue: VenueStats) => {
    const isTop1 = venue.rank === 1;
    const isTop3 = venue.rank >= 1 && venue.rank <= 3;
    const activityPct = maxCount > 0 ? Math.max(8, (venue.count / maxCount) * 100) : 8;

    // Sub-line: neighborhood + count
    const subParts: string[] = [];
    if (venue.neighborhood) subParts.push(venue.neighborhood);
    if (venue.count > 0) subParts.push(`${venue.count} here now`);
    const subLine = subParts.join(' \u00b7 ');

    return (
      <div
        key={venue.venue_name}
        className={`relative overflow-hidden rounded-2xl transition-all ${
          isTop1
            ? 'bg-[#221540] p-5 shadow-[0_4px_20px_rgba(168,85,247,0.15)] border border-[#d4ff00]/20'
            : isTop3
            ? 'bg-[#1e1338] p-4 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.08]'
            : 'bg-[#1a1030] p-4 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.06]'
        }`}
      >
        {/* Subtle top glow for #1 */}
        {isTop1 && (
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4ff00]/40 to-transparent" />
        )}

        <div className="flex items-center gap-3">
          {/* Rank Number */}
          <div className="flex-shrink-0 w-10 text-center">
            <div className={`font-bold tabular-nums ${
              isTop1
                ? 'text-4xl text-[#d4ff00] drop-shadow-[0_0_8px_rgba(212,255,0,0.3)]'
                : isTop3
                ? 'text-3xl text-[#d4ff00]'
                : 'text-2xl text-white/50'
            }`}>
              {venue.rank}
            </div>
          </div>

          {/* Venue Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleVenueClick(venue.venue_name, venue.venue_id)}
                className={`font-semibold text-white truncate hover:text-[#d4ff00] transition-colors text-left ${
                  isTop1 ? 'text-lg' : 'text-base'
                }`}
              >
                {venue.venue_name}
              </button>
              {venue.isNewlyOpened && (
                <span className="px-2 py-0.5 bg-[#d4ff00]/15 rounded-full text-[10px] text-[#d4ff00] font-semibold flex-shrink-0">
                  NEW
                </span>
              )}
              {/* Trend arrow */}
              {venue.movement === 'up' && (
                <ChevronUp className="w-5 h-5 text-[#d4ff00] flex-shrink-0" />
              )}
              {venue.movement === 'down' && (
                <ChevronDown className="w-5 h-5 text-[#ef4444] flex-shrink-0" />
              )}
            </div>
            {subLine && (
              <p className="text-white/40 text-xs mt-0.5 truncate">{subLine}</p>
            )}
          </div>

          {/* Friend Avatars */}
          <div className="flex-shrink-0">
            {renderFriendPopover(venue)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-b from-[#1a0f2e] to-[#110a24] pb-40">
      {/* Header */}
      <PageHeader
        title="Leaderboard"
        subtitle="Top spots tonight"
        onSearchPress={() => setShowFriendSearch(true)}
        rightActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 whitespace-nowrap rounded-2xl bg-white/5 border border-white/15 text-white font-medium text-sm transition-colors hover:bg-white/10">
                <span>{selectedNeighborhood || `All ${getCityLabel(city)}`}</span>
                <ChevronDown className="w-4 h-4 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#1a0f2e] border border-white/15 max-h-64 overflow-y-auto">
              <DropdownMenuItem
                onClick={() => setSelectedNeighborhood(null)}
                className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
              >
                All {getCityLabel(city)}
              </DropdownMenuItem>
              {(CITY_NEIGHBORHOODS[city] || []).map((neighborhood) => (
                <DropdownMenuItem
                  key={neighborhood}
                  onClick={() => setSelectedNeighborhood(neighborhood)}
                  className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                >
                  {neighborhood}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Leaderboard List */}
      <PullToRefresh onRefresh={fetchLeaderboard}>
        <div className="px-4 py-6 space-y-3">
        {isLoading ? (
          <LeaderboardSkeleton />
        ) : (
          <>
        {/* Promoted Section */}
        {venues.filter(v => v.isPromoted).length > 0 && (
          <>
            {venues.filter(v => v.isPromoted).map((venue) => (
              <div
                key={venue.venue_name}
                className="relative overflow-hidden rounded-2xl p-4 bg-[#1e1338] shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className="px-2.5 py-1 bg-[#a855f7]/15 rounded-full text-[10px] text-[#a855f7] font-semibold uppercase tracking-wide">
                      Promoted
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handleVenueClick(venue.venue_name, venue.venue_id)}
                      className="text-base font-semibold text-white truncate hover:text-[#d4ff00] transition-colors block text-left"
                    >
                      {venue.venue_name}
                    </button>
                    {(venue.neighborhood || venue.count > 0) && (
                      <p className="text-white/40 text-xs mt-0.5 truncate">
                        {[venue.neighborhood, venue.count > 0 ? `${venue.count} here now` : null].filter(Boolean).join(' \u00b7 ')}
                      </p>
                    )}
                  </div>
                  {venue.isNewlyOpened && (
                    <span className="px-2 py-0.5 bg-[#d4ff00]/15 rounded-full text-[10px] text-[#d4ff00] font-semibold flex-shrink-0">
                      NEW
                    </span>
                  )}
                  <div className="flex-shrink-0">
                    {renderFriendPopover(venue)}
                  </div>
                </div>
              </div>
            ))}
            <div className="py-1" />
          </>
        )}

        {/* Ranked Section */}
        {venues.filter(v => !v.isPromoted).map((venue) => renderVenueCard(venue))}

        {venues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <BarChart3 className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              The night hasn't started yet
            </h3>
            <p className="text-white/50 text-sm max-w-xs mb-6">
              When people check in, the hottest spots show up here.
            </p>
            <button
              onClick={openCheckIn}
              className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full px-6 py-2.5 font-medium transition-colors"
            >
              Be the First
            </button>
          </div>
        )}
          </>
        )}
        </div>
      </PullToRefresh>

      {/* Biggest Mover Card — fixed at bottom */}
      {biggestMover && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-20 w-full max-w-[430px] px-4">
          <div className="bg-[#1e1338] border border-white/[0.06] rounded-2xl p-3.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[#a855f7] text-xs font-semibold uppercase tracking-wide mb-0.5">Biggest Mover</p>
                <button
                  onClick={() => handleVenueClick(biggestMover.venue_name, biggestMover.venue_id)}
                  className="text-base font-bold text-white hover:text-[#d4ff00] transition-colors truncate block text-left max-w-full"
                >
                  {biggestMover.venue_name}
                </button>
              </div>
              {biggestMover.friends.length > 0 && (
                <div className="flex-shrink-0">
                  {renderFriendPopover(biggestMover)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
  );
}
