import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MapPin, Pin, Flame, Home } from 'lucide-react';
import { isFromTonight } from '@/lib/time-context';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useUserCity } from '@/hooks/useUserCity';
import { cn } from '@/lib/utils';
import { VenueYapThread } from './VenueYapThread';
import { Skeleton } from '@/components/ui/skeleton';

interface YapTabProps {
  venueName?: string;
  isPrivatePartyNav?: boolean;
}

interface YapQuote {
  id: string;
  text: string;
  score: number;
  venue_name: string;
  venue_neighborhood: string | null;
  venue_type: string | null;
  created_at: string;
  is_private_party?: boolean;
}

const relativeTime = (dateStr: string) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
};

export function YapTab({ venueName: venueNameProp, isPrivatePartyNav }: YapTabProps) {
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const { city } = useUserCity();
  const [view, setView] = useState<'directory' | 'thread'>(venueNameProp ? 'thread' : 'directory');
  const [threadVenueName, setThreadVenueName] = useState<string | null>(venueNameProp || null);
  const [userVenueName, setUserVenueName] = useState<string | null>(null);
  const [userIsPrivateParty, setUserIsPrivateParty] = useState(false);
  const [quotes, setQuotes] = useState<YapQuote[]>([]);
  const [sortMode, setSortMode] = useState<'hot' | 'new'>('hot');
  const [isLoading, setIsLoading] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [pinnedCounts, setPinnedCounts] = useState<Map<string, number>>(new Map());

  // Always respond to venueNameProp changes — ensures "Yap about it" button works
  // even if YapTab was already mounted from a previous navigation
  useEffect(() => {
    if (venueNameProp) {
      setThreadVenueName(venueNameProp);
      setView('thread');
    }
  }, [venueNameProp]);

  // For private party nav, also update when async userVenueName resolves
  useEffect(() => {
    if (isPrivatePartyNav && userVenueName) {
      setThreadVenueName(userVenueName);
      setView('thread');
    }
  }, [isPrivatePartyNav, userVenueName]);

  // Fetch user's current venue independently from quotes
  useEffect(() => {
    if (!user) return;
    
    const fetchUserVenue = async () => {
      const { data } = await supabase
        .from('night_statuses')
        .select('venue_name, is_private_party, party_neighborhood')
        .eq('user_id', user.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .neq('status', 'home')
        .maybeSingle();
      
      if (data?.is_private_party) {
        const displayName = data.venue_name || `Private Party${data.party_neighborhood ? ` · ${data.party_neighborhood}` : ''}`;
        setUserVenueName(displayName);
        setUserIsPrivateParty(true);
      } else {
        setUserVenueName(data?.venue_name || null);
        setUserIsPrivateParty(false);
      }
    };
    
    fetchUserVenue();

    // Realtime subscription for venue changes
    const channel = supabase
      .channel(`yap-venue-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'night_statuses',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newRecord = payload.new;
          if (newRecord) {
            if (newRecord.is_private_party) {
              const displayName = newRecord.venue_name || `Private Party${newRecord.party_neighborhood ? ` · ${newRecord.party_neighborhood}` : ''}`;
              setUserVenueName(displayName);
              setUserIsPrivateParty(true);
            } else {
              setUserVenueName(newRecord.venue_name || null);
              setUserIsPrivateParty(newRecord.is_private_party || false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (view === 'directory') {
      fetchQuotes();
    }
  }, [view, user, demoEnabled, city]);

  // Realtime subscription for yap_messages changes
  useEffect(() => {
    if (view !== 'directory') return;

    const channel = supabase
      .channel('yap-directory-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'yap_messages' },
        () => fetchQuotes()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'yap_messages' },
        () => fetchQuotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, user, demoEnabled, city]);

  const fetchQuotes = async () => {
    if (!hasFetchedOnce) setIsLoading(true);
    try {
      // Fetch regular venue yaps
      let yapQuery = supabase
        .from('yap_messages')
        .select('id, text, score, venue_name, created_at, is_private_party')
        .gt('expires_at', new Date().toISOString())
        .eq('is_private_party', false);
      if (!demoEnabled) {
        yapQuery = yapQuery.eq('is_demo', false);
      }
      const { data: yapData } = await yapQuery;

      const regularYaps = yapData || [];

      // Get unique venue names for metadata lookup — filter to current city
      const venueNames = [...new Set(regularYaps.map(y => y.venue_name))];
      let venueMetaMap = new Map<string, { type: string | null; neighborhood: string | null; id: string }>();

      if (venueNames.length > 0) {
        let venueQuery = supabase
          .from('venues')
          .select('id, name, type, neighborhood')
          .in('name', venueNames);
        
        // Filter venues to current city
        if (city) {
          venueQuery = venueQuery.eq('city', city);
        }
        
        const { data: venueData } = await venueQuery;

        if (venueData) {
          for (const v of venueData) {
            venueMetaMap.set(v.name, { type: v.type, neighborhood: v.neighborhood, id: v.id });
          }
        }

        // Fetch pinned message counts for these venues
        const venueIds = [...venueMetaMap.values()].map(v => v.id).filter(Boolean);
        if (venueIds.length > 0) {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: pinnedData } = await supabase
            .from('venue_yap_messages')
            .select('venue_id')
            .eq('is_pinned', true)
            .in('venue_id', venueIds)
            .gte('created_at', twentyFourHoursAgo);

          if (pinnedData) {
            const counts = new Map<string, number>();
            for (const row of pinnedData) {
              counts.set(row.venue_id, (counts.get(row.venue_id) || 0) + 1);
            }
            const nameCountMap = new Map<string, number>();
            for (const [name, meta] of venueMetaMap.entries()) {
              const count = counts.get(meta.id);
              if (count) nameCountMap.set(name, count);
            }
            setPinnedCounts(nameCountMap);
          }
        }
      }

      // Filter regular yaps to only include venues in the current city AND from tonight
      const filteredRegularYaps = regularYaps.filter(y => venueMetaMap.has(y.venue_name) && isFromTonight(y.created_at));

      const enrichedRegular: YapQuote[] = filteredRegularYaps.map(yap => ({
        id: yap.id,
        text: yap.text,
        score: yap.score,
        venue_name: yap.venue_name,
        venue_neighborhood: venueMetaMap.get(yap.venue_name)?.neighborhood || null,
        venue_type: venueMetaMap.get(yap.venue_name)?.type || null,
        created_at: yap.created_at,
        is_private_party: false,
      }));

      setQuotes(enrichedRegular);
    } catch (error) {
      console.error('Error fetching yap quotes:', error);
    } finally {
      setIsLoading(false);
      setHasFetchedOnce(true);
    }
  };

  const sortedQuotes = [...quotes].sort((a, b) => {
    if (sortMode === 'hot') return b.score - a.score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const openThread = (name: string) => {
    setThreadVenueName(name);
    setView('thread');
  };

  const goBackToDirectory = () => {
    setView('directory');
    setThreadVenueName(null);
  };

  if (view === 'thread' && threadVenueName) {
    // If we navigated here from a check-in confirmation (venueNameProp provided),
    // trust that the user is checked in — skip the async race condition
    const isCheckedInHere = venueNameProp ? true : userVenueName === threadVenueName;
    return (
      <VenueYapThread
        venueName={threadVenueName}
        canPost={isCheckedInHere}
        onBack={goBackToDirectory}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32 bg-[#2d1b4e]/40" />
        <Skeleton className="h-4 w-64 bg-[#2d1b4e]/40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-full bg-[#2d1b4e]/40" />
          <Skeleton className="h-8 w-20 rounded-full bg-[#2d1b4e]/40" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl bg-[#2d1b4e]/40" />
        ))}
      </div>
    );
  }

  // Detect consecutive same-venue groups
  const isFirstInGroup = (index: number) => {
    if (index === 0) return true;
    return sortedQuotes[index].venue_name !== sortedQuotes[index - 1].venue_name;
  };
  const isInGroup = (index: number) => {
    const vn = sortedQuotes[index].venue_name;
    const prev = index > 0 && sortedQuotes[index - 1].venue_name === vn;
    const next = index < sortedQuotes.length - 1 && sortedQuotes[index + 1].venue_name === vn;
    return prev || next;
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold text-white mb-1">Yap</h1>
        <p className="text-white/60 text-sm">Live from the crowd — see what people are saying at venues tonight</p>
      </div>

      {/* You're At compact bar */}
      {userVenueName && (
        <button
          onClick={() => openThread(userVenueName)}
          className="w-full flex items-center justify-between bg-white/[0.06] backdrop-blur-sm rounded-2xl px-4 py-2.5 active:bg-white/[0.10] transition-colors animate-fade-in"
        >
          <span className="text-white text-sm flex items-center gap-1">
            {userIsPrivateParty ? <Home className="h-4 w-4 text-[#d4ff00] inline" /> : <MapPin className="h-4 w-4 text-[#d4ff00] inline" />}
            {' '}You're at <span className="font-semibold">{userVenueName}</span>
          </span>
          <span className="bg-[#d4ff00] text-[#1a0f2e] font-bold text-xs px-3 py-1 rounded-full">View</span>
        </button>
      )}

      {/* Sort Toggles */}
      <div className="flex items-center gap-6 animate-fade-in">
        <button
          onClick={() => setSortMode('hot')}
          className={`relative pb-2 text-lg font-medium transition-colors ${
            sortMode === 'hot' ? 'text-white' : 'text-white/60'
          }`}
        >
          Hot
          {sortMode === 'hot' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
          )}
        </button>
        <button
          onClick={() => setSortMode('new')}
          className={`relative pb-2 text-lg font-medium transition-colors ${
            sortMode === 'new' ? 'text-white' : 'text-white/60'
          }`}
        >
          New
          {sortMode === 'new' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
          )}
        </button>
      </div>

      {/* Quote Feed */}
      {sortedQuotes.length > 0 ? (
        <div className="space-y-3">
          {sortedQuotes.map((quote, index) => {
            const firstInGroup = isFirstInGroup(index);
            const grouped = isInGroup(index);
            const showVenueHeader = grouped && firstInGroup;
            const showVenueLine = !grouped;
            const venuePinnedCount = pinnedCounts.get(quote.venue_name) || 0;
            const isPartyYap = quote.is_private_party;
            const LocationIcon = isPartyYap ? Home : MapPin;

            return (
              <div key={quote.id} className="animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
                {/* Group venue header */}
                {showVenueHeader && (
                  <div className="mb-1.5 ml-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openThread(quote.venue_name); }}
                      className="text-xs flex items-center gap-1 hover:text-white/70 transition-colors"
                    >
                      <LocationIcon className="h-3.5 w-3.5 text-[#d4ff00] inline" /> <span className="font-semibold text-white/70">{quote.venue_name}</span>
                      {quote.venue_neighborhood && <span className="text-white/40">· {quote.venue_neighborhood}</span>}
                    </button>
                    {venuePinnedCount > 0 && firstInGroup && (
                      <p className="text-white/40 text-[11px] mt-0.5 ml-4">
                        <Pin className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" /> {venuePinnedCount} update{venuePinnedCount > 1 ? 's' : ''} from venue
                      </p>
                    )}
                  </div>
                )}

                {/* Quote card */}
                <button
                  onClick={() => openThread(quote.venue_name)}
                  className={cn(
                    'w-full text-left rounded-2xl p-5 relative',
                    'bg-white/[0.06] backdrop-blur-sm',
                    'active:bg-white/[0.10] transition-all duration-200',
                    index === 0 && sortMode === 'hot' && 'p-6'
                  )}
                >
                  {/* Quote text — the hero */}
                  <p className={cn(
                    "text-white font-medium leading-relaxed mb-3",
                    index === 0 && sortMode === 'hot' ? 'text-[17px]' : 'text-[15px]'
                  )}>
                    {quote.text}
                  </p>

                  {/* Venue line (only if not in a group) */}
                  {showVenueLine && (
                    <div className="mb-2">
                      <p
                        className="text-xs hover:text-white/60 transition-colors"
                        onClick={(e) => { e.stopPropagation(); openThread(quote.venue_name); }}
                      >
                        <LocationIcon className="h-3.5 w-3.5 text-[#d4ff00] inline" /> <span className="font-semibold text-white">{quote.venue_name}</span>
                        {quote.venue_neighborhood && <span className="text-white/40"> · {quote.venue_neighborhood}</span>}
                      </p>
                      {venuePinnedCount > 0 && (
                        <p className="text-white/40 text-[11px] mt-0.5 ml-4">
                          <Pin className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" /> {venuePinnedCount} update{venuePinnedCount > 1 ? 's' : ''} from venue
                        </p>
                      )}
                    </div>
                  )}

                  {/* Bottom row: score + timestamp */}
                  <div className="flex items-center justify-between">
                    {quote.score > 0 ? (
                      <span className="text-[#d4ff00] text-xs font-semibold">
                        {index === 0 && sortMode === 'hot' && <Flame className="h-3.5 w-3.5 text-[#d4ff00] inline mr-0.5" />}▲ {quote.score}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="text-white/30 text-xs">{relativeTime(quote.created_at)}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6">
            <Mic className="h-10 w-10 text-[#a855f7]/60" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No Yap yet tonight
          </h3>
          <p className="text-white/50 text-sm max-w-xs">
            Be the first to post when you're out! 🎤
          </p>
        </div>
      )}
    </div>
  );
}
