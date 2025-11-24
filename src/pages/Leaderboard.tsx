import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
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
  const [venues, setVenues] = useState<VenueStats[]>([]);
  const [biggestMover, setBiggestMover] = useState<BiggestMover | null>(null);

  useEffect(() => {
    if (user) {
      fetchLeaderboard();
    }
  }, [user]);

  const fetchLeaderboard = async () => {
    // Get all active night statuses with locations
    const { data: statuses } = await supabase
      .from('night_statuses')
      .select(`
        venue_name,
        user_id,
        updated_at,
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

    if (!statuses) return;

    // Group by venue
    const venueMap = new Map<string, VenueStats>();
    
    statuses.forEach((status: any) => {
      const venueName = status.venue_name;
      if (!venueMap.has(venueName)) {
        venueMap.set(venueName, {
          venue_name: venueName,
          count: 0,
          rank: 0,
          movement: 'same',
          friends: [],
          energyLevel: 0,
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

    // Convert to array and sort by count
    let venueArray = Array.from(venueMap.values())
      .sort((a, b) => b.count - a.count)
      .map((venue, index) => ({
        ...venue,
        rank: index + 1,
        movement: Math.random() > 0.5 ? 'up' : (Math.random() > 0.5 ? 'down' : 'same') as 'up' | 'down' | 'same',
        energyLevel: Math.min(venue.count, 3),
      }));

    // Add promoted venues at top (mock data)
    const promotedVenues: VenueStats[] = [
      {
        venue_name: 'Silo',
        count: 4,
        rank: 0,
        movement: 'same',
        friends: [
          { user_id: '1', display_name: 'User1', avatar_url: null },
          { user_id: '2', display_name: 'User2', avatar_url: null },
          { user_id: '3', display_name: 'User3', avatar_url: null },
          { user_id: '4', display_name: 'User4', avatar_url: null },
        ],
        energyLevel: 2,
        isPromoted: true,
      },
      {
        venue_name: 'Attaboy',
        count: 3,
        rank: 0,
        movement: 'same',
        friends: [
          { user_id: '5', display_name: 'User5', avatar_url: null },
          { user_id: '6', display_name: 'User6', avatar_url: null },
          { user_id: '7', display_name: 'User7', avatar_url: null },
        ],
        energyLevel: 2,
        isPromoted: true,
      },
    ];

    setVenues([...promotedVenues, ...venueArray]);

    // Set biggest mover (mock data)
    if (venueArray.length > 0) {
      setBiggestMover({
        venue_name: venueArray[0].venue_name,
        friends: venueArray[0].friends.slice(0, 3),
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
    <div className="min-h-screen bg-[#1a0f2e] pb-24">
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
        {venues.map((venue, index) => (
          <div
            key={venue.venue_name}
            className={`
              relative overflow-hidden rounded-2xl p-4
              ${venue.isPromoted 
                ? 'bg-[#2d1b4e]/60 border border-[#a855f7]/30' 
                : 'bg-[#2d1b4e]/80 border border-[#a855f7]/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
              }
            `}
          >
            <div className="flex items-center gap-4">
              {/* Rank or Promoted Badge */}
              <div className="flex-shrink-0">
                {venue.isPromoted ? (
                  <div className="px-3 py-1 bg-[#a855f7]/20 rounded-full text-xs text-[#a855f7] font-medium">
                    Promoted
                  </div>
                ) : (
                  <div className="text-3xl font-bold text-[#d4ff00] w-8 text-center">
                    {venue.rank}
                  </div>
                )}
              </div>

              {/* Venue Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white truncate">
                    {venue.venue_name}
                  </h3>
                  {!venue.isPromoted && venue.movement !== 'same' && (
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
                    <Avatar
                      key={idx}
                      className="h-8 w-8 border-2 border-[#a855f7] shadow-[0_0_10px_rgba(168,85,247,0.6)]"
                    >
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
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
        <div className="fixed bottom-24 left-0 right-0 z-20 px-4">
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
                    <Avatar
                      key={idx}
                      className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.8)]"
                    >
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
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
