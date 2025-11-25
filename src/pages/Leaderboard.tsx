import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronUp, ChevronDown, BarChart3, Clock, DollarSign } from 'lucide-react';

interface VenueStats {
  venue_name: string;
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
}

interface BiggestMover {
  venue_name: string;
  friends: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
  }[];
  timeAgo: string;
  coverCharge?: number;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  const bootstrapEnabled = useBootstrapMode();
  useAutoVenueTracking(); // Trigger auto-venue tracking on leaderboard view
  const [venues, setVenues] = useState<VenueStats[]>([]);
  const [biggestMover, setBiggestMover] = useState<BiggestMover | null>(null);

  useEffect(() => {
    if (user) {
      fetchLeaderboard();
    }
  }, [user, demoEnabled, bootstrapEnabled]);

  const fetchLeaderboard = async () => {
    // Build query for night statuses
    let query = supabase
      .from('night_statuses')
      .select(`
        venue_name,
        user_id,
        updated_at,
        is_promoted,
        profiles:user_id (
          display_name,
          avatar_url
        )
      `)
      .not('venue_name', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    // Hybrid mode: show real data + promoted venues (75% fake / 25% real)
    if (bootstrapEnabled && !demoEnabled) {
      // Show real data OR promoted demo venues (but not all demo data)
      query = query.or('is_demo.eq.false,and(is_demo.eq.true,is_promoted.eq.true)');
    } else if (!demoEnabled) {
      // Pure real mode (only real data when bootstrap is off)
      query = query.eq('is_demo', false);
    }
    // If demoEnabled is true, show everything (no filter)

    const { data: statuses } = await query;

    if (!statuses) return;

    // Group by venue
    const venueMap = new Map<string, VenueStats>();
    
    statuses.forEach((status: any) => {
      const venueName = status.venue_name;
      const isPromoted = status.is_promoted || false;
      
      if (!venueMap.has(venueName)) {
        venueMap.set(venueName, {
          venue_name: venueName,
          count: 0,
          rank: 0,
          movement: 'same',
          friends: [],
          energyLevel: 0,
          isPromoted,
        });
      }
      
      const venue = venueMap.get(venueName)!;
      venue.count++;
      venue.friends.push({
        user_id: status.user_id,
        display_name: status.profiles?.display_name || 'User',
        avatar_url: status.profiles?.avatar_url || null,
      });
    });

    // Convert to array and separate promoted from non-promoted
    const venueArray = Array.from(venueMap.values());
    
    // Get all promoted venues and sort by count
    const allPromotedVenues = venueArray.filter(v => v.isPromoted);
    allPromotedVenues.sort((a, b) => b.count - a.count);
    
    // Get top 2 promoted venues only
    const topPromotedVenues = allPromotedVenues.slice(0, 2);
    
    // Get all non-promoted venues and sort by count
    const nonPromotedVenues = venueArray.filter(v => !v.isPromoted);
    nonPromotedVenues.sort((a, b) => b.count - a.count);
    
    // Take top 15 non-promoted venues for ranking
    const rankedVenues = nonPromotedVenues.slice(0, 15).map((venue, index) => ({
      ...venue,
      rank: index + 1,
      movement: Math.random() > 0.5 ? 'up' : (Math.random() > 0.5 ? 'down' : 'same') as 'up' | 'down' | 'same',
      energyLevel: Math.min(venue.count, 3),
    }));

    // Assign properties to promoted venues (no rank)
    const promotedWithProps = topPromotedVenues.map(venue => ({
      ...venue,
      rank: 0, // No rank for promoted
      movement: 'same' as const,
      energyLevel: Math.min(venue.count, 3),
    }));

    // Combine: promoted first, then ranked
    const finalVenues = [...promotedWithProps, ...rankedVenues];

    setVenues(finalVenues);

    // Set biggest mover (from non-promoted venues only)
    if (nonPromotedVenues.length > 0) {
      const moverVenue = nonPromotedVenues[Math.floor(Math.random() * Math.min(5, nonPromotedVenues.length))];
      setBiggestMover({
        venue_name: moverVenue.venue_name,
        friends: moverVenue.friends.slice(0, 3),
        timeAgo: '10m',
        coverCharge: 20,
      });
    }
  };

  const renderEnergyBars = (level: number) => {
    return (
      <div className="flex gap-1">
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
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-light tracking-[0.3em] text-white mb-2">Spotted</h1>
            <h2 className="text-3xl font-bold text-white">Leaderboard</h2>
            <p className="text-white/60 text-sm mt-1">Top Places to Go Out Now</p>
          </div>
          <button 
            onClick={openCheckIn} 
            className="text-4xl font-bold text-[#d4ff00] hover:scale-110 transition-transform"
          >
            S
          </button>
        </div>
      </div>

      {/* Leaderboard List */}
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

                  {/* Venue Name */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {venue.venue_name}
                    </h3>
                  </div>

                  {/* Energy Bars */}
                  <div className="flex-shrink-0">
                    {renderEnergyBars(venue.energyLevel)}
                  </div>

                  {/* Friend Avatars */}
                  <div className="flex-shrink-0 flex items-center">
                    <div className="flex -space-x-2">
                      {venue.friends.slice(0, 3).map((friend, idx) => (
                        <button
                          key={idx}
                          onClick={() => openFriendCard({
                            userId: friend.user_id,
                            displayName: friend.display_name,
                            avatarUrl: friend.avatar_url,
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
                    {venue.friends.length > 3 && (
                      <span className="ml-2 text-sm text-white font-medium">
                        +{venue.friends.length - 3}
                      </span>
                    )}
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

              {/* Venue Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white truncate">
                    {venue.venue_name}
                  </h3>
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

              {/* Energy Bars */}
              <div className="flex-shrink-0">
                {renderEnergyBars(venue.energyLevel)}
              </div>

              {/* Friend Avatars */}
              <div className="flex-shrink-0 flex items-center">
                <div className="flex -space-x-2">
                  {venue.friends.slice(0, 3).map((friend, idx) => (
                    <button
                      key={idx}
                      onClick={() => openFriendCard({
                        userId: friend.user_id,
                        displayName: friend.display_name,
                        avatarUrl: friend.avatar_url,
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
                {venue.friends.length > 3 && (
                  <span className="ml-2 text-sm text-white font-medium">
                    +{venue.friends.length - 3}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {venues.length === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="h-16 w-16 mx-auto text-white/20 mb-4" />
            <p className="text-white/60">No venues with active check-ins yet</p>
          </div>
        )}
      </div>

      {/* Biggest Mover Card */}
      {biggestMover && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 w-full max-w-[430px] px-4">
          <div className="bg-[#2d1b4e] border-2 border-[#a855f7] rounded-2xl p-4 shadow-[0_0_40px_rgba(168,85,247,0.8)]">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-[#a855f7] text-sm font-medium mb-1">Biggest Mover</p>
                <h3 className="text-2xl font-bold text-[#d4ff00] flex items-center gap-2">
                  {biggestMover.venue_name}
                  <BarChart3 className="h-5 w-5" />
                </h3>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1 text-white/80 text-sm">
                    <Clock className="h-4 w-4" />
                    <span>{biggestMover.timeAgo}</span>
                  </div>
                  {biggestMover.coverCharge && (
                    <div className="flex items-center gap-1 text-white/80 text-sm">
                      <DollarSign className="h-4 w-4" />
                      <span>${biggestMover.coverCharge}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Friend Avatars */}
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  {biggestMover.friends.map((friend, idx) => (
                    <button
                      key={idx}
                      onClick={() => openFriendCard({
                        userId: friend.user_id,
                        displayName: friend.display_name,
                        avatarUrl: friend.avatar_url,
                      })}
                      className="transition-transform hover:scale-110"
                    >
                      <Avatar className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.8)]">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  ))}
                </div>
                {biggestMover.friends.length > 0 && (
                  <span className="ml-3 text-sm text-white font-medium">
                    +3
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
