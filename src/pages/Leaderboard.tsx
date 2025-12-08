import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useUserCity } from '@/hooks/useUserCity';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { ChevronUp, ChevronDown, Bell, BarChart3, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { CityBadge } from '@/components/CityBadge';
import { LeaderboardSkeleton } from '@/components/LeaderboardSkeleton';
import { isVenueOpen, VenueHours } from '@/lib/venue-hours';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CITY_NEIGHBORHOODS, getCityLabel } from '@/lib/city-neighborhoods';
interface VenueStats {
  venue_name: string;
  venue_id: string | null;
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
  useAutoVenueTracking(); // Trigger auto-venue tracking on leaderboard view
  const [venues, setVenues] = useState<VenueStats[]>([]);
  const [biggestMover, setBiggestMover] = useState<BiggestMover | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);

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
  }, [user, demoEnabled, bootstrapEnabled, city, selectedNeighborhood]);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      // Build query for night statuses with venue popularity_rank, filtered by city
      let query = supabase
        .from('night_statuses')
        .select(`
          venue_name,
          venue_id,
          user_id,
          updated_at,
          is_promoted,
          profiles:user_id (
            display_name,
            avatar_url,
            is_demo
          ),
          venues!inner(popularity_rank, is_promoted, city, opened_at, operating_hours)
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

      // Hybrid mode: show real data + ALL demo data to populate leaderboard
      if (bootstrapEnabled && !demoEnabled) {
        // Show everything (both real and demo) to ensure leaderboard is populated
        // No filter needed - promoted venues handled separately
      } else if (!demoEnabled) {
        // Pure real mode (only real data when bootstrap is off)
        query = query.eq('is_demo', false);
      }
      // If demoEnabled is true, show everything (no filter)

      // Parallelize: fetch promoted venues AND night statuses at the same time
      let promotedQuery = supabase.from('venues').select('id, name, popularity_rank, is_promoted, opened_at, neighborhood').eq('is_promoted', true).eq('city', city);
      if (selectedNeighborhood) {
        promotedQuery = promotedQuery.eq('neighborhood', selectedNeighborhood);
      }

      // If neighborhood is selected in demo mode, also fetch ALL venues in that neighborhood
      let neighborhoodVenuesQuery = null;
      if (selectedNeighborhood && demoEnabled) {
        neighborhoodVenuesQuery = supabase
          .from('venues')
          .select('id, name, neighborhood, popularity_rank, is_promoted, opened_at')
          .eq('city', city)
          .eq('neighborhood', selectedNeighborhood)
          .order('popularity_rank', { ascending: true });
      }

      const [promotedVenuesResult, statusesResult, neighborhoodVenuesResult] = await Promise.all([
        promotedQuery,
        query,
        neighborhoodVenuesQuery,
      ]);

      const promotedVenues = promotedVenuesResult.data;
      const statuses = statusesResult.data;
      const neighborhoodVenues = neighborhoodVenuesResult?.data;

    // Calculate if venue is newly opened (within last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Calculate 30 minutes ago for velocity tracking
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Group by venue, including popularity_rank
    const venueMap = new Map<string, VenueStats & { popularity_rank: number }>();
    
    // In demo mode with neighborhood filter, add ALL venues in that neighborhood first
    // This ensures venues appear even with 0 check-ins, ranked by popularity_rank
    if (selectedNeighborhood && demoEnabled && neighborhoodVenues) {
      neighborhoodVenues.forEach((venue, index) => {
        const isNewlyOpened = venue.opened_at 
          ? new Date(venue.opened_at) > threeMonthsAgo 
          : false;
        
        // Calculate energy level based on popularity_rank within neighborhood
        const neighborhoodRank = index + 1;
        let energyLevel = 1;
        if (neighborhoodRank <= 3) energyLevel = 3;
        else if (neighborhoodRank <= 6) energyLevel = 2;
        
        venueMap.set(venue.name, {
          venue_name: venue.name,
          venue_id: venue.id,
          count: 0,
          rank: neighborhoodRank,
          movement: 'same',
          friends: [],
          energyLevel,
          isPromoted: venue.is_promoted,
          isNewlyOpened,
          popularity_rank: venue.popularity_rank || 999,
          recentCheckinCount: 0,
        });
      });
    }
    
    // Add promoted venues to ensure they always appear (even with 0 check-ins)
    promotedVenues?.forEach((venue) => {
      if (venueMap.has(venue.name)) return; // Skip if already added from neighborhood venues
      
      const isNewlyOpened = venue.opened_at 
        ? new Date(venue.opened_at) > threeMonthsAgo 
        : false;
      
      venueMap.set(venue.name, {
        venue_name: venue.name,
        venue_id: venue.id,
        count: 0,
        rank: 0,
        movement: 'same',
        friends: [],
        energyLevel: 1,
        isPromoted: true,
        isNewlyOpened,
        popularity_rank: venue.popularity_rank || 999,
        recentCheckinCount: 0,
      });
    });
    
    // Then process night statuses
    statuses?.forEach((status: any) => {
      const venueName = status.venue_name;
      const venueId = status.venue_id;
      const isPromoted = status.venues?.is_promoted || false;
      const popularityRank = status.venues?.popularity_rank || 999;
      const openedAt = status.venues?.opened_at;
      const operatingHours = status.venues?.operating_hours as VenueHours | null;
      const isNewlyOpened = openedAt 
        ? new Date(openedAt) > threeMonthsAgo 
        : false;
      const isDemo = status.profiles?.is_demo || false;
      const updatedAt = status.updated_at ? new Date(status.updated_at) : null;
      const isRecentCheckin = updatedAt && updatedAt > thirtyMinutesAgo;
      
      if (!venueMap.has(venueName)) {
        venueMap.set(venueName, {
          venue_name: venueName,
          venue_id: venueId,
          count: 0,
          rank: 0,
          movement: 'same',
          friends: [],
          energyLevel: 0,
          isPromoted,
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
      
      // In demo mode, show all avatars; in bootstrap mode, only show real user avatars
      // Demo data still contributes to venue rankings/energy
      if (demoEnabled || !bootstrapEnabled || !isDemo) {
        venue.friends.push({
          user_id: status.user_id,
          display_name: status.profiles?.display_name || 'User',
          avatar_url: status.profiles?.avatar_url || null,
        });
      }
    });

    // Convert to array and separate promoted from non-promoted
    const venueArray = Array.from(venueMap.values());
    
    // Get all promoted venues and sort by count desc, then popularity_rank asc
    const allPromotedVenues = venueArray.filter(v => v.isPromoted);
    allPromotedVenues.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.popularity_rank - b.popularity_rank;
    });
    
    // Get top 2 promoted venues only
    const topPromotedVenues = allPromotedVenues.slice(0, 2);
    
    // Get all non-promoted venues and sort by count desc, then popularity_rank asc
    const nonPromotedVenues = venueArray.filter(v => !v.isPromoted);
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

      // Select mover venue with fallback chain
      const moverVenue = openVenuesWithVelocity[0] 
        || openVenuesWithActivity[0] 
        || ((bootstrapEnabled || demoEnabled) ? anyVenueWithActivity[0] : null);

      if (moverVenue) {
        setBiggestMover({
          venue_name: moverVenue.venue_name,
          venue_id: moverVenue.venue_id,
          friends: moverVenue.friends.slice(0, 3),
        });
      } else {
        setBiggestMover(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderEnergyBars = (level: number) => {
    const barHeights = ['h-2', 'h-3', 'h-4']; // Progressive: 8px, 12px, 16px
    
    return (
      <div className="flex gap-0.5 items-end">
        {[1, 2, 3].map((bar, index) => (
          <div
            key={bar}
            className={`w-1.5 rounded-sm transition-all ${barHeights[index]} ${
              bar <= level ? 'bg-white' : 'bg-white/20'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-start justify-between p-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
              <CityBadge />
            </div>
            <h2 className="text-3xl font-bold text-white">Leaderboard</h2>
            
            {/* Neighborhood Filter Dropdown */}
            <div className="mt-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#a855f7]/20 hover:bg-[#a855f7]/30 rounded-full text-white text-sm border border-[#a855f7]/40 transition-all">
                    <span>{selectedNeighborhood || `All ${getCityLabel(city)}`}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1a0f2e] border border-[#a855f7]/40 max-h-64 overflow-y-auto">
                  <DropdownMenuItem
                    onClick={() => setSelectedNeighborhood(null)}
                    className="text-white hover:bg-[#a855f7]/20 focus:bg-[#a855f7]/20 cursor-pointer"
                  >
                    All {getCityLabel(city)}
                  </DropdownMenuItem>
                  {(CITY_NEIGHBORHOODS[city] || []).map((neighborhood) => (
                    <DropdownMenuItem
                      key={neighborhood}
                      onClick={() => setSelectedNeighborhood(neighborhood)}
                      className="text-white hover:bg-[#a855f7]/20 focus:bg-[#a855f7]/20 cursor-pointer"
                    >
                      {neighborhood}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <p className="text-white/60 text-sm mt-2">
              {selectedNeighborhood 
                ? `Top 20 Tonight: ${selectedNeighborhood}`
                : 'Top Places to Go Out Now'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/messages', { state: { activeTab: 'activity' } })}
              className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
              aria-label="View activity"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button 
              onClick={openCheckIn} 
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Check In" className="h-12 w-12 object-contain" />
            </button>
          </div>
        </div>
      </div>

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
                className="relative overflow-hidden rounded-2xl p-4 bg-[#2d1b4e]/60 border border-[#a855f7]/30"
              >
                <div className="flex items-center gap-4">
                  {/* Promoted Badge */}
                  <div className="flex-shrink-0">
                    <div className="px-3 py-1 bg-[#a855f7]/20 rounded-full text-xs text-[#a855f7] font-medium">
                      Promoted
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleVenueClick(venue.venue_name, venue.venue_id)}
                        className="text-lg font-semibold text-white truncate hover:text-[#d4ff00] transition-colors"
                      >
                        {venue.venue_name}
                      </button>
                      {venue.isNewlyOpened && (
                        <span className="px-2 py-0.5 bg-[#d4ff00]/20 rounded-full text-xs text-[#d4ff00] font-medium">
                          NEW
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Friend Avatars with Popover */}
                  <div className="flex-shrink-0 flex items-center">
                    {venue.friends.length > 0 ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center cursor-pointer hover:opacity-90 transition-opacity">
                            <div className="flex -space-x-2">
                              {venue.friends.slice(0, 2).map((friend, idx) => (
                                <Avatar key={idx} className="h-6 w-6 border border-[#a855f7] shadow-[0_0_6px_rgba(168,85,247,0.5)]">
                                  <AvatarImage src={friend.avatar_url || undefined} />
                                  <AvatarFallback className="bg-[#1a0f2e] text-white text-[10px]">
                                    {friend.display_name[0]}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                            </div>
                            {venue.friends.length > 2 && (
                              <span className="ml-1 text-xs text-white/70 font-medium">
                                +{venue.friends.length - 2}
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl" align="end">
                          <p className="text-white/60 text-xs px-2 mb-2">Also here tonight</p>
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
                    ) : null}
                  </div>

                  {/* Energy Bars */}
                  <div className="flex-shrink-0">
                    {renderEnergyBars(venue.energyLevel)}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Separator */}
            <div className="py-2">
              <div className="border-t border-[#a855f7]/20"></div>
            </div>
          </>
        )}

        {/* Ranked Section */}
        {venues.filter(v => !v.isPromoted).map((venue) => (
          <div
            key={venue.venue_name}
            className="relative overflow-hidden rounded-2xl p-4 bg-[#2d1b4e]/80 border border-[#a855f7]/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
          >
            <div className="flex items-center gap-4">
              {/* Rank Number */}
              <div className="flex-shrink-0">
                <div className="text-3xl font-bold text-[#d4ff00] w-8 text-center">
                  {venue.rank}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVenueClick(venue.venue_name, venue.venue_id)}
                    className="text-lg font-semibold text-white truncate hover:text-[#d4ff00] transition-colors"
                  >
                    {venue.venue_name}
                  </button>
                  {venue.isNewlyOpened && (
                    <span className="px-2 py-0.5 bg-[#d4ff00]/20 rounded-full text-xs text-[#d4ff00] font-medium">
                      NEW
                    </span>
                  )}
                  {venue.movement !== 'same' && (
                    <div>
                      {venue.movement === 'up' ? (
                        <ChevronUp className="w-4 h-4 text-[#d4ff00]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#a855f7]" />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Friend Avatars with Popover */}
              <div className="flex-shrink-0 flex items-center">
                {venue.friends.length > 0 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center cursor-pointer hover:opacity-90 transition-opacity">
                        <div className="flex -space-x-2">
                          {venue.friends.slice(0, 2).map((friend, idx) => (
                            <Avatar key={idx} className="h-6 w-6 border border-[#a855f7] shadow-[0_0_6px_rgba(168,85,247,0.5)]">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#1a0f2e] text-white text-[10px]">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {venue.friends.length > 2 && (
                          <span className="ml-1 text-xs text-white/70 font-medium">
                            +{venue.friends.length - 2}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl" align="end">
                      <p className="text-white/60 text-xs px-2 mb-2">Also here tonight</p>
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
                ) : null}
              </div>

              {/* Energy Bars */}
              <div className="flex-shrink-0">
                {renderEnergyBars(venue.energyLevel)}
              </div>
            </div>
          </div>
        ))}

        {venues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6 border border-[#a855f7]/20">
              <ChevronUp className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              No venues trending yet
            </h3>
            <p className="text-white/50 text-sm max-w-xs">
              Check in to be the first! Venues appear here when friends are out.
            </p>
          </div>
        )}
          </>
        )}
        </div>
      </PullToRefresh>

      {/* Biggest Mover Card */}
      {biggestMover && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 w-full max-w-[430px] px-4">
          <div className="bg-[#2d1b4e] border border-[#a855f7] rounded-2xl p-3 shadow-[0_0_20px_rgba(168,85,247,0.6)]">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-[#a855f7] text-sm font-medium mb-0.5">Biggest Mover</p>
                <button
                  onClick={() => handleVenueClick(biggestMover.venue_name, biggestMover.venue_id)}
                  className="text-lg font-bold text-[#d4ff00] flex items-center gap-2 hover:text-[#d4ff00]/80 transition-colors"
                >
                  {biggestMover.venue_name}
                  <BarChart3 className="h-4 w-4" />
                </button>
              </div>

              {/* Friend Avatars with Popover */}
              <div className="flex items-center">
                {biggestMover.friends.length > 0 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center cursor-pointer hover:opacity-90 transition-opacity">
                        <div className="flex -space-x-2">
                          {biggestMover.friends.map((friend, idx) => (
                            <Avatar key={idx} className="h-8 w-8 border-2 border-[#a855f7] shadow-[0_0_10px_rgba(168,85,247,0.6)]">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {biggestMover.friends.length > 3 && (
                          <span className="ml-3 text-sm text-white font-medium">
                            +{biggestMover.friends.length - 3}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl" align="end">
                      <p className="text-white/60 text-xs px-2 mb-2">Also here tonight</p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {biggestMover.friends.map((friend, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              openFriendCard({
                                userId: friend.user_id,
                                displayName: friend.display_name,
                                avatarUrl: friend.avatar_url,
                                venueName: biggestMover.venue_name,
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
                ) : (
                  <span className="text-white/40 text-xs">Be the first 👀</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
