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
import { ChevronUp, ChevronDown, BarChart3, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { CityBadge } from '@/components/CityBadge';

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

  const calculateEnergyLevel = (
    userCount: number, 
    popularityRank: number, 
    isBootstrapMode: boolean
  ): number => {
    if (!isBootstrapMode) {
      // Production mode: 100% user data
      return Math.min(userCount, 3) || 1;
    }
    
    // Bootstrap/Hybrid mode: 75% reputation + 25% user data
    let reputationScore: number;
    if (popularityRank <= 7) {
      reputationScore = 3; // Top tier venues
    } else if (popularityRank <= 15) {
      reputationScore = 2; // Mid tier venues
    } else {
      reputationScore = 1; // Lower tier venues
    }
    
    const userScore = Math.min(userCount, 3) || 1;
    const weightedScore = (0.75 * reputationScore) + (0.25 * userScore);
    
    return Math.round(weightedScore);
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
  }, [user, demoEnabled, bootstrapEnabled, city]);

  const fetchLeaderboard = async () => {
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
        venues!inner(popularity_rank, is_promoted, city, opened_at)
      `)
      .eq('venues.city', city)
      .not('venue_name', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    // Hybrid mode: show real data + ALL demo data to populate leaderboard
    if (bootstrapEnabled && !demoEnabled) {
      // Show everything (both real and demo) to ensure leaderboard is populated
      // No filter needed - promoted venues handled separately
    } else if (!demoEnabled) {
      // Pure real mode (only real data when bootstrap is off)
      query = query.eq('is_demo', false);
    }
    // If demoEnabled is true, show everything (no filter)

    // Also fetch promoted venues directly to ensure they always appear, filtered by city
    const { data: promotedVenues } = await supabase
      .from('venues')
      .select('id, name, popularity_rank, is_promoted, opened_at')
      .eq('is_promoted', true)
      .eq('city', city);

    const { data: statuses } = await query;

    // Calculate if venue is newly opened (within last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Group by venue, including popularity_rank
    const venueMap = new Map<string, VenueStats & { popularity_rank: number }>();
    
    // First, add promoted venues to ensure they always appear (even with 0 check-ins)
    promotedVenues?.forEach((venue) => {
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
      });
    });
    
    // Then process night statuses
    statuses?.forEach((status: any) => {
      const venueName = status.venue_name;
      const venueId = status.venue_id;
      const isPromoted = status.venues?.is_promoted || false;
      const popularityRank = status.venues?.popularity_rank || 999;
      const openedAt = status.venues?.opened_at;
      const isNewlyOpened = openedAt 
        ? new Date(openedAt) > threeMonthsAgo 
        : false;
      const isDemo = status.profiles?.is_demo || false;
      
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
        });
      }
      
      const venue = venueMap.get(venueName)!;
      venue.count++; // Count ALL users (including demo) for energy calculation
      
      // In bootstrap mode, only show real user avatars
      // Demo data still contributes to venue rankings/energy, but avatars are real only
      if (!bootstrapEnabled || !isDemo) {
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
    const rankedVenues = nonPromotedVenues.slice(0, 20).map((venue, index) => ({
      ...venue,
      rank: index + 1,
      movement: Math.random() > 0.5 ? 'up' : (Math.random() > 0.5 ? 'down' : 'same') as 'up' | 'down' | 'same',
      energyLevel: calculateEnergyLevel(venue.count, venue.popularity_rank, bootstrapEnabled),
    }));

    // Assign properties to promoted venues (no rank)
    const promotedWithProps = topPromotedVenues.map(venue => ({
      ...venue,
      rank: 0, // No rank for promoted
      movement: 'same' as const,
      energyLevel: calculateEnergyLevel(venue.count, venue.popularity_rank, bootstrapEnabled),
    }));

    // Combine: promoted first, then ranked
    const finalVenues = [...promotedWithProps, ...rankedVenues];

    setVenues(finalVenues);

    // Set biggest mover (from non-promoted venues only)
    if (nonPromotedVenues.length > 0) {
      const moverVenue = nonPromotedVenues[Math.floor(Math.random() * Math.min(5, nonPromotedVenues.length))];
      setBiggestMover({
        venue_name: moverVenue.venue_name,
        venue_id: moverVenue.venue_id,
        friends: moverVenue.friends.slice(0, 3),
      });
    }
  };

  const renderEnergyBars = (level: number) => {
    return (
      <div className="flex gap-1 items-end">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={`w-1 rounded-full transition-all ${
              bar <= level
                ? 'h-4 bg-white'
                : 'h-2 bg-white/20'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a0f2e] pb-48">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-start justify-between p-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
              <CityBadge />
            </div>
            <h2 className="text-3xl font-bold text-white">Leaderboard</h2>
            <p className="text-white/60 text-sm mt-1">Top Places to Go Out Now</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/notifications')}
              className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
              aria-label="View notifications"
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

                  {/* Friend Avatars */}
                  <div className="flex-shrink-0 flex items-center">
                    {venue.friends.length > 0 ? (
                      <>
                        <div className="flex -space-x-1.5">
                          {venue.friends.slice(0, 2).map((friend, idx) => (
                            <button
                              key={idx}
                              onClick={() => openFriendCard({
                                userId: friend.user_id,
                                displayName: friend.display_name,
                                avatarUrl: friend.avatar_url,
                                venueName: venue.venue_name,
                              })}
                              className="transition-transform hover:scale-110"
                            >
                              <Avatar className="h-5 w-5 border border-[#a855f7] shadow-[0_0_6px_rgba(168,85,247,0.5)]">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="bg-[#1a0f2e] text-white text-[8px]">
                                  {friend.display_name[0]}
                                </AvatarFallback>
                              </Avatar>
                            </button>
                          ))}
                        </div>
                        {venue.friends.length > 2 && (
                          <span className="ml-1 text-xs text-white/70 font-medium">
                            +{venue.friends.length - 2}
                          </span>
                        )}
                      </>
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

              {/* Friend Avatars */}
              <div className="flex-shrink-0 flex items-center">
                {venue.friends.length > 0 ? (
                  <>
                    <div className="flex -space-x-1.5">
                      {venue.friends.slice(0, 2).map((friend, idx) => (
                        <button
                          key={idx}
                          onClick={() => openFriendCard({
                            userId: friend.user_id,
                            displayName: friend.display_name,
                            avatarUrl: friend.avatar_url,
                            venueName: venue.venue_name,
                          })}
                          className="transition-transform hover:scale-110"
                        >
                          <Avatar className="h-5 w-5 border border-[#a855f7] shadow-[0_0_6px_rgba(168,85,247,0.5)]">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#1a0f2e] text-white text-[8px]">
                              {friend.display_name[0]}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      ))}
                    </div>
                    {venue.friends.length > 2 && (
                      <span className="ml-1 text-xs text-white/70 font-medium">
                        +{venue.friends.length - 2}
                      </span>
                    )}
                  </>
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
              <BarChart3 className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              No venues trending yet
            </h3>
            <p className="text-white/50 text-sm max-w-xs">
              Check in to be the first! Venues appear here when friends are out.
            </p>
          </div>
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

              {/* Friend Avatars */}
              <div className="flex items-center">
                {biggestMover.friends.length > 0 ? (
                  <>
                    <div className="flex -space-x-2">
                      {biggestMover.friends.map((friend, idx) => (
                        <button
                          key={idx}
                          onClick={() => openFriendCard({
                            userId: friend.user_id,
                            displayName: friend.display_name,
                            avatarUrl: friend.avatar_url,
                            venueName: biggestMover.venue_name,
                          })}
                          className="transition-transform hover:scale-110"
                        >
                          <Avatar className="h-8 w-8 border-2 border-[#a855f7] shadow-[0_0_10px_rgba(168,85,247,0.6)]">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                              {friend.display_name[0]}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      ))}
                    </div>
                    {biggestMover.friends.length > 3 && (
                      <span className="ml-3 text-sm text-white font-medium">
                        +{biggestMover.friends.length - 3}
                      </span>
                    )}
                  </>
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
