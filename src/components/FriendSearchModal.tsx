import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useUserCity } from '@/hooks/useUserCity';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, ArrowLeft, Home, MapPin } from 'lucide-react';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  status: 'out' | 'planning' | 'home';
  venue_name: string | null;
  planning_neighborhood: string | null;
  has_story: boolean;
}

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
}

interface FriendSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ORDER: Record<string, number> = { out: 0, planning: 1, home: 2 };

export function FriendSearchModal({ open, onOpenChange }: FriendSearchModalProps) {
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const { city } = useUserCity();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const friendProfiles = useMemo(() => {
    if (!allProfiles || !cachedFriendIds) return [];
    const friendSet = new Set(cachedFriendIds);
    let filtered = allProfiles.filter(p => friendSet.has(p.id));
    if (!demoEnabled) filtered = filtered.filter(p => !p.is_demo);
    return filtered;
  }, [allProfiles, cachedFriendIds, demoEnabled]);

  useEffect(() => {
    if (open && user) {
      fetchData();
    }
    if (!open) setSearch('');
  }, [open, user, friendProfiles, city]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Fetch friends + statuses
      const friendIds = friendProfiles.map(p => p.id);
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [checkinsRes, nightRes, storiesRes, venuesRes] = await Promise.all([
        friendIds.length > 0
          ? supabase.from('checkins').select('user_id, venue_name, started_at').in('user_id', friendIds).is('ended_at', null).gt('started_at', twentyFourHoursAgo).order('started_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        friendIds.length > 0
          ? supabase.from('night_statuses').select('user_id, status, planning_neighborhood, venue_name, updated_at, is_private_party, party_neighborhood').in('user_id', friendIds).not('expires_at', 'is', null).gt('expires_at', now)
          : Promise.resolve({ data: [] }),
        friendIds.length > 0
          ? supabase.from('stories').select('user_id').in('user_id', friendIds).gt('expires_at', now)
          : Promise.resolve({ data: [] }),
        supabase.from('venues').select('id, name, neighborhood').eq('city', city).order('popularity_rank'),
      ]);

      // Process friends
      const checkinMap = new Map<string, { venue_name: string; started_at: string | null }>();
      (checkinsRes.data || []).forEach((c: any) => { if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, { venue_name: c.venue_name, started_at: c.started_at }); });

      const nightMap = new Map<string, any>();
      (nightRes.data || []).forEach((n: any) => { if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n); });

      const storySet = new Set<string>();
      (storiesRes.data || []).forEach((s: any) => storySet.add(s.user_id));

      const friendsData: Friend[] = friendProfiles.map(profile => {
        let status: 'out' | 'planning' | 'home' = 'home';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;

        const activeCheckin = checkinMap.get(profile.id);
        const nightStatus = nightMap.get(profile.id);

        const checkinTime = activeCheckin?.started_at ? new Date(activeCheckin.started_at).getTime() : 0;
        const nightTime = nightStatus?.updated_at ? new Date(nightStatus.updated_at).getTime() : 0;

        if (nightStatus?.status === 'out' && nightTime >= checkinTime) {
          status = 'out';
          if (nightStatus.is_private_party) {
            venue_name = nightStatus.party_neighborhood ? `Private Party (${nightStatus.party_neighborhood})` : 'Private Party';
          } else {
            venue_name = nightStatus.venue_name || null;
          }
        } else if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin.venue_name;
        } else if (nightStatus?.status === 'out') {
          status = 'out';
          venue_name = nightStatus.venue_name || null;
        } else if (nightStatus?.status === 'planning') {
          status = 'planning';
          planning_neighborhood = nightStatus.planning_neighborhood;
        }

        return {
          id: profile.id,
          display_name: profile.display_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          status,
          venue_name,
          planning_neighborhood,
          has_story: storySet.has(profile.id),
        };
      });

      friendsData.sort((a, b) => {
        const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return diff !== 0 ? diff : a.display_name.localeCompare(b.display_name);
      });

      setFriends(friendsData);
      setVenues(venuesRes.data || []);
    } catch (error) {
      console.error('Error fetching search data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFriend = (friend: Friend) => {
    onOpenChange(false);
    openFriendCard({
      userId: friend.id,
      displayName: friend.display_name,
      avatarUrl: friend.avatar_url,
      venueName: friend.venue_name || undefined,
    });
  };

  const handleSelectVenue = (venue: Venue) => {
    onOpenChange(false);
    openVenueCard(venue.id);
  };

  const q = search.toLowerCase();

  const filteredFriends = useMemo(() =>
    friends.filter(f =>
      f.display_name.toLowerCase().includes(q) ||
      f.username.toLowerCase().includes(q)
    ), [friends, q]);

  const filteredVenues = useMemo(() =>
    search.length > 0
      ? venues.filter(v =>
          v.name.toLowerCase().includes(q) ||
          v.neighborhood.toLowerCase().includes(q)
        )
      : [], [venues, q, search]);

  const outFriends = filteredFriends.filter(f => f.status === 'out');
  const planningFriends = filteredFriends.filter(f => f.status === 'planning');
  const homeFriends = filteredFriends.filter(f => f.status === 'home');

  const hasResults = filteredFriends.length > 0 || filteredVenues.length > 0;

  const renderFriendRow = (friend: Friend) => (
    <button
      key={friend.id}
      onClick={() => handleSelectFriend(friend)}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
    >
      <Avatar className="w-9 h-9 border-2 border-[#a855f7]/40">
        <AvatarImage src={friend.avatar_url || undefined} />
        <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-white font-medium text-sm truncate">
          {friend.display_name}
        </p>
        {friend.status === 'out' ? (
          <p className="text-[#d4ff00] text-xs truncate">
            At {friend.venue_name || 'Nearby'}
          </p>
        ) : friend.status === 'planning' ? (
          <p className="text-[#a855f7] text-xs truncate">
            TBD{friend.planning_neighborhood ? ` · ${friend.planning_neighborhood}` : ''}
          </p>
        ) : (
          <p className="text-white/40 text-xs">Home</p>
        )}
      </div>
    </button>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[#110a24] z-[500] flex flex-col animate-fade-in" style={{ touchAction: 'auto' }}>
      {/* Search Header */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <button
          onClick={() => { onOpenChange(false); setSearch(''); }}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 bg-[#2d1b4e]/80 border border-[#a855f7]/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search friends or places..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-white text-sm flex-1 outline-none placeholder:text-white/40"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-9 w-9 rounded-full bg-white/5" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24 bg-white/5" />
                  <Skeleton className="h-3 w-16 bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : !hasResults ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">
              {search ? 'No results found' : 'Your friend list is empty'}
            </p>
          </div>
        ) : (
          <>
            {/* Venues — only shown when searching */}
            {filteredVenues.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Places</h3>
                <div className="space-y-1">
                  {filteredVenues.slice(0, 8).map(venue => (
                    <button
                      key={venue.id}
                      onClick={() => handleSelectVenue(venue)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-[#d4ff00]" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white font-medium text-sm truncate">{venue.name}</p>
                        <p className="text-white/40 text-xs truncate">{venue.neighborhood}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Friends Out Now */}
            {outFriends.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                  Friends Out Now
                  <span className="text-white/50 ml-1">({outFriends.length})</span>
                </h3>
                <div className="space-y-1">
                  {outFriends.map(renderFriendRow)}
                </div>
              </div>
            )}

            {/* Friends Planning */}
            {planningFriends.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                  TBD tonight
                  <span className="text-white/50 ml-1">({planningFriends.length})</span>
                </h3>
                <div className="space-y-1">
                  {planningFriends.map(renderFriendRow)}
                </div>
              </div>
            )}

            {/* Staying In */}
            {homeFriends.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5 text-white/50" /> Staying in
                  <span className="text-white/50">({homeFriends.length})</span>
                </h3>
                <div className="space-y-1">
                  {homeFriends.map(renderFriendRow)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
