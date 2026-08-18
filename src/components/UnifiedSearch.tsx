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
import { Search, X, ArrowLeft, Home, MapPin, Users, Building2, Music, Wine, Beer, Building, UserPlus } from 'lucide-react';

interface SearchFriend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  status: 'out' | 'planning' | 'home';
  venue_name: string | null;
  planning_neighborhood: string | null;
  has_story: boolean;
  lat: number | null;
  lng: number | null;
}

interface SearchVenue {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  lat: number;
  lng: number;
}

export interface UnifiedSearchPersonResult {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  venueName?: string | null;
  lat?: number | null;
  lng?: number | null;
  isFriend: boolean;
}

export interface UnifiedSearchVenueResult {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  lat: number;
  lng: number;
}

interface UnifiedSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPerson?: (person: UnifiedSearchPersonResult) => void;
  onSelectVenue?: (venue: UnifiedSearchVenueResult) => void;
  onSelectNeighborhood?: (neighborhood: string) => void;
}

const STATUS_ORDER: Record<string, number> = { out: 0, planning: 1, home: 2 };

function venueTypeIcon(type: string) {
  if (type === 'nightclub') return <Music className="h-4 w-4 text-[#a855f7]" />;
  if (type === 'cocktail_bar') return <Wine className="h-4 w-4 text-[#a855f7]" />;
  if (type === 'bar') return <Beer className="h-4 w-4 text-[#a855f7]" />;
  if (type === 'rooftop') return <Building className="h-4 w-4 text-[#a855f7]" />;
  return <MapPin className="h-4 w-4 text-[#d4ff00]" />;
}

export function UnifiedSearch({ open, onOpenChange, onSelectPerson, onSelectVenue, onSelectNeighborhood }: UnifiedSearchProps) {
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const { city } = useUserCity();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();

  const [friends, setFriends] = useState<SearchFriend[]>([]);
  const [venues, setVenues] = useState<SearchVenue[]>([]);
  const [globalPeople, setGlobalPeople] = useState<Array<{ id: string; display_name: string; username: string; avatar_url: string | null }>>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterPeople, setFilterPeople] = useState(true);
  const [filterVenues, setFilterVenues] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const friendProfiles = useMemo(() => {
    if (!allProfiles || !cachedFriendIds) return [];
    const friendSet = new Set(cachedFriendIds);
    let filtered = allProfiles.filter((p: any) => friendSet.has(p.id));
    if (!demoEnabled) filtered = filtered.filter((p: any) => !p.is_demo);
    return filtered;
  }, [allProfiles, cachedFriendIds, demoEnabled]);

  useEffect(() => {
    if (open && user) fetchData();
    if (!open) setSearch('');
  }, [open, user, friendProfiles, city]);

  useEffect(() => {
    if (open) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [open]);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const friendIds = friendProfiles.map((p: any) => p.id);
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [checkinsRes, nightRes, storiesRes, venuesRes] = await Promise.all([
        friendIds.length > 0
          ? supabase.from('checkins').select('user_id, venue_name, started_at').in('user_id', friendIds).is('ended_at', null).gt('started_at', twentyFourHoursAgo).order('started_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        friendIds.length > 0
          ? supabase.from('night_statuses').select('user_id, status, planning_neighborhood, venue_name, updated_at, is_private_party, party_neighborhood, lat, lng').in('user_id', friendIds).not('expires_at', 'is', null).gt('expires_at', now)
          : Promise.resolve({ data: [] }),
        friendIds.length > 0
          ? supabase.from('stories').select('user_id').in('user_id', friendIds).gt('expires_at', now)
          : Promise.resolve({ data: [] }),
        supabase.from('venues').select('id, name, neighborhood, type, lat, lng, is_demo').eq('city', city).order('popularity_rank'),
      ]);

      const checkinMap = new Map<string, { venue_name: string; started_at: string | null }>();
      (checkinsRes.data || []).forEach((c: any) => {
        if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, { venue_name: c.venue_name, started_at: c.started_at });
      });

      const nightMap = new Map<string, any>();
      (nightRes.data || []).forEach((n: any) => {
        if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n);
      });

      const storySet = new Set<string>();
      (storiesRes.data || []).forEach((s: any) => storySet.add(s.user_id));

      const friendsData: SearchFriend[] = friendProfiles.map((profile: any) => {
        let status: 'out' | 'planning' | 'home' = 'home';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;
        let lat: number | null = null;
        let lng: number | null = null;

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
          lat = nightStatus.lat ?? null;
          lng = nightStatus.lng ?? null;
        } else if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin.venue_name;
        } else if (nightStatus?.status === 'out') {
          status = 'out';
          venue_name = nightStatus.venue_name || null;
          lat = nightStatus.lat ?? null;
          lng = nightStatus.lng ?? null;
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
          lat,
          lng,
        };
      });

      friendsData.sort((a, b) => {
        const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return diff !== 0 ? diff : a.display_name.localeCompare(b.display_name);
      });

      let venueData = (venuesRes.data || []) as (SearchVenue & { is_demo?: boolean })[];
      if (!demoEnabled) venueData = venueData.filter(v => !v.is_demo);

      setFriends(friendsData);
      setVenues(venueData);
    } catch (error) {
      console.error('Error fetching search data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Global people search (non-friends, min 2 chars)
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2 || !allProfiles || !user) {
      setGlobalPeople([]);
      return;
    }
    const lq = search.toLowerCase();
    const friendSet = new Set(cachedFriendIds || []);
    const results = allProfiles
      .filter((p: any) =>
        p.id !== user.id &&
        !friendSet.has(p.id) &&
        (!demoEnabled ? !p.is_demo : true) &&
        (p.display_name?.toLowerCase().includes(lq) ||
         p.username?.toLowerCase().includes(lq))
      )
      .slice(0, 10)
      .map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
      }));
    setGlobalPeople(results);
  }, [search, allProfiles, cachedFriendIds, demoEnabled, user]);

  const q = search.toLowerCase();

  const filteredFriends = useMemo(() =>
    filterPeople
      ? friends.filter(f =>
          !search || f.display_name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q)
        )
      : [],
  [friends, q, search, filterPeople]);

  const filteredVenues = useMemo(() =>
    filterVenues && search.length > 0
      ? venues.filter(v =>
          v.name.toLowerCase().includes(q) || v.neighborhood.toLowerCase().includes(q)
        ).slice(0, 10)
      : [],
  [venues, q, search, filterVenues]);

  const trendingVenues = useMemo(() =>
    filterVenues ? venues.slice(0, 3) : [],
  [venues, filterVenues]);

  const filteredNeighborhoods = useMemo(() => {
    if (!filterVenues || !search) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const v of venues) {
      if (!seen.has(v.neighborhood) && v.neighborhood.toLowerCase().includes(q)) {
        seen.add(v.neighborhood);
        result.push(v.neighborhood);
        if (result.length >= 5) break;
      }
    }
    return result;
  }, [venues, q, search, filterVenues]);

  const outFriends = filteredFriends.filter(f => f.status === 'out');
  const planningFriends = filteredFriends.filter(f => f.status === 'planning');
  const homeFriends = filteredFriends.filter(f => f.status === 'home');
  const visibleGlobalPeople = filterPeople ? globalPeople : [];

  const handleClose = () => { onOpenChange(false); setSearch(''); };

  const handleSelectFriend = (friend: SearchFriend) => {
    handleClose();
    if (onSelectPerson) {
      onSelectPerson({
        id: friend.id,
        displayName: friend.display_name,
        avatarUrl: friend.avatar_url,
        venueName: friend.venue_name,
        lat: friend.lat,
        lng: friend.lng,
        isFriend: true,
      });
    } else {
      openFriendCard({
        userId: friend.id,
        displayName: friend.display_name,
        avatarUrl: friend.avatar_url,
        venueName: friend.venue_name || undefined,
      });
    }
  };

  const handleSelectVenue = (venue: SearchVenue) => {
    handleClose();
    if (onSelectVenue) {
      onSelectVenue(venue);
    } else {
      openVenueCard(venue.id);
    }
  };

  const handleSelectGlobalPerson = (person: { id: string; display_name: string; avatar_url: string | null }) => {
    handleClose();
    if (onSelectPerson) {
      onSelectPerson({ id: person.id, displayName: person.display_name, avatarUrl: person.avatar_url, isFriend: false });
    } else {
      openFriendCard({ userId: person.id, displayName: person.display_name, avatarUrl: person.avatar_url });
    }
  };

  const handleSelectNeighborhood = (nbhd: string) => {
    handleClose();
    onSelectNeighborhood?.(nbhd);
  };

  const isSearching = search.length > 0;
  const hasSearchResults = filteredFriends.length > 0 || filteredVenues.length > 0 || filteredNeighborhoods.length > 0 || visibleGlobalPeople.length > 0;
  const hasEmptyStateContent = trendingVenues.length > 0 || filteredFriends.length > 0;

  const renderFriendRow = (friend: SearchFriend) => (
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
        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
        {friend.status === 'out' ? (
          <p className="text-[#d4ff00] text-xs truncate">Out · {friend.venue_name || 'Nearby'}</p>
        ) : friend.status === 'planning' ? (
          <p className="text-[#a855f7] text-xs truncate">TBD{friend.planning_neighborhood ? ` · ${friend.planning_neighborhood}` : ''}</p>
        ) : (
          <p className="text-white/40 text-xs">Home</p>
        )}
      </div>
    </button>
  );

  const renderVenueRow = (venue: SearchVenue) => (
    <button
      key={venue.id}
      onClick={() => handleSelectVenue(venue)}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
    >
      <span className="flex items-center">{venueTypeIcon(venue.type)}</span>
      <div className="flex-1 text-left min-w-0">
        <p className="text-white font-medium text-sm truncate">{venue.name}</p>
        <p className="text-white/40 text-xs truncate">{venue.neighborhood}</p>
      </div>
    </button>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[#110a24] z-[500] flex flex-col animate-fade-in" style={{ touchAction: 'auto' }}>
      {/* Search Header */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 bg-[#2d1b4e]/80 border border-[#a855f7]/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search people, venues, or neighborhoods..."
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

      {/* Filter Toggles */}
      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={() => setFilterPeople(!filterPeople)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterPeople
              ? 'bg-[#a855f7]/30 text-white border border-[#a855f7]/50'
              : 'bg-[#2d1b4e]/50 text-white/50 border border-white/10'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          People
        </button>
        <button
          onClick={() => setFilterVenues(!filterVenues)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterVenues
              ? 'bg-[#a855f7]/30 text-white border border-[#a855f7]/50'
              : 'bg-[#2d1b4e]/50 text-white/50 border border-white/10'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Venues
        </button>
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
        ) : !isSearching ? (
          !hasEmptyStateContent ? (
            <div className="text-center py-12">
              <p className="text-white/40 text-sm">Search for people or places</p>
            </div>
          ) : (
            <>
              {trendingVenues.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Trending Tonight</h3>
                  <div className="space-y-1">{trendingVenues.map(renderVenueRow)}</div>
                </div>
              )}
              {outFriends.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                    Friends Out Now <span className="text-white/50">({outFriends.length})</span>
                  </h3>
                  <div className="space-y-1">{outFriends.map(renderFriendRow)}</div>
                </div>
              )}
              {planningFriends.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                    TBD tonight <span className="text-white/50">({planningFriends.length})</span>
                  </h3>
                  <div className="space-y-1">{planningFriends.map(renderFriendRow)}</div>
                </div>
              )}
              {homeFriends.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Home className="h-3.5 w-3.5 text-white/50" /> Staying in <span className="text-white/50">({homeFriends.length})</span>
                  </h3>
                  <div className="space-y-1">{homeFriends.map(renderFriendRow)}</div>
                </div>
              )}
            </>
          )
        ) : !hasSearchResults ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">No results found</p>
          </div>
        ) : (
          <>
            {filteredVenues.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Places</h3>
                <div className="space-y-1">{filteredVenues.map(renderVenueRow)}</div>
              </div>
            )}

            {filteredNeighborhoods.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Neighborhoods</h3>
                <div className="space-y-1">
                  {filteredNeighborhoods.map(nbhd => (
                    <button
                      key={nbhd}
                      onClick={() => handleSelectNeighborhood(nbhd)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-[#a855f7]" />
                      </div>
                      <p className="text-white font-medium text-sm">{nbhd}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {outFriends.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                  Friends Out Now <span className="text-white/50">({outFriends.length})</span>
                </h3>
                <div className="space-y-1">{outFriends.map(renderFriendRow)}</div>
              </div>
            )}

            {planningFriends.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                  TBD tonight <span className="text-white/50">({planningFriends.length})</span>
                </h3>
                <div className="space-y-1">{planningFriends.map(renderFriendRow)}</div>
              </div>
            )}

            {homeFriends.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5 text-white/50" /> Staying in <span className="text-white/50">({homeFriends.length})</span>
                </h3>
                <div className="space-y-1">{homeFriends.map(renderFriendRow)}</div>
              </div>
            )}

            {visibleGlobalPeople.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">People</h3>
                <div className="space-y-1">
                  {visibleGlobalPeople.map(person => (
                    <button
                      key={person.id}
                      onClick={() => handleSelectGlobalPerson(person)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                    >
                      <Avatar className="w-9 h-9 border-2 border-white/10">
                        <AvatarImage src={person.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                          {person.display_name[0]}
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
          </>
        )}
      </div>
    </div>
  );
}
