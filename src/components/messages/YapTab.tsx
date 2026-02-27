import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MapPin, Pin, Flame } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { cn } from '@/lib/utils';
import { VenueYapThread } from './VenueYapThread';
import { Skeleton } from '@/components/ui/skeleton';

interface YapTabProps {
  venueName?: string;
}

interface YapQuote {
  id: string;
  text: string;
  score: number;
  venue_name: string;
  venue_neighborhood: string | null;
  venue_type: string | null;
  created_at: string;
}

const relativeTime = (dateStr: string) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
};

export function YapTab({ venueName: venueNameProp }: YapTabProps) {
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const [view, setView] = useState<'directory' | 'thread'>(venueNameProp ? 'thread' : 'directory');
  const [threadVenueName, setThreadVenueName] = useState<string | null>(venueNameProp || null);
  const [userVenueName, setUserVenueName] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<YapQuote[]>([]);
  const [sortMode, setSortMode] = useState<'hot' | 'new'>('hot');
  const [isLoading, setIsLoading] = useState(true);
  const [pinnedCounts, setPinnedCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (venueNameProp) {
      setThreadVenueName(venueNameProp);
      setView('thread');
    }
  }, [venueNameProp]);

  // Fetch user's current venue independently from quotes
  useEffect(() => {
    if (!user) return;
    
    const fetchUserVenue = async () => {
      const { data } = await supabase
        .from('night_statuses')
        .select('venue_name')
        .eq('user_id', user.id)
        .not('venue_name', 'is', null)
        .maybeSingle();
      setUserVenueName(data?.venue_name || null);
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
            setUserVenueName(newRecord.venue_name || null);
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
  }, [view, user, demoEnabled]);

  const fetchQuotes = async () => {
    setIsLoading(true);
    try {
      // userVenueName is now managed by its own useEffect + realtime subscription
      let yapQuery = supabase
        .from('yap_messages')
        .select('id, text, score, venue_name, created_at')
        .gt('expires_at', new Date().toISOString())
        .eq('is_private_party', false);
      if (!demoEnabled) {
        yapQuery = yapQuery.eq('is_demo', false);
      }
      const { data: yapData } = await yapQuery;

      const yaps = yapData || [];

      // Get unique venue names for metadata lookup
      const venueNames = [...new Set(yaps.map(y => y.venue_name))];
      let venueMetaMap = new Map<string, { type: string | null; neighborhood: string | null; id: string }>();

      if (venueNames.length > 0) {
        const { data: venueData } = await supabase
          .from('venues')
          .select('id, name, type, neighborhood')
          .in('name', venueNames);

        if (venueData) {
          for (const v of venueData) {
            venueMetaMap.set(v.name, { type: v.type, neighborhood: v.neighborhood, id: v.id });
          }
        }

        // Fetch pinned message counts for these venues
        const venueIds = venueData?.map(v => v.id).filter(Boolean) || [];
        if (venueIds.length > 0) {
          const now = new Date();
          const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
          
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
            // Map venue_id counts back to venue names
            const nameCountMap = new Map<string, number>();
            for (const [name, meta] of venueMetaMap.entries()) {
              const count = counts.get(meta.id);
              if (count) nameCountMap.set(name, count);
            }
            setPinnedCounts(nameCountMap);
          }
        }
      }

      const enrichedQuotes: YapQuote[] = yaps.map(yap => ({
        id: yap.id,
        text: yap.text,
        score: yap.score,
        venue_name: yap.venue_name,
        venue_neighborhood: venueMetaMap.get(yap.venue_name)?.neighborhood || null,
        venue_type: venueMetaMap.get(yap.venue_name)?.type || null,
        created_at: yap.created_at,
      }));

      setQuotes(enrichedQuotes);
    } catch (error) {
      console.error('Error fetching yap quotes:', error);
    } finally {
      setIsLoading(false);
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
    const isCheckedInHere = userVenueName === threadVenueName;
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
          <span className="text-white text-sm flex items-center gap-1"><MapPin className="h-4 w-4 text-[#d4ff00] inline" /> You're at <span className="font-semibold">{userVenueName}</span></span>
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

            return (
              <div key={quote.id} className="animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
                {/* Group venue header */}
                {showVenueHeader && (
                  <div className="mb-1.5 ml-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openThread(quote.venue_name); }}
                      className="text-xs flex items-center gap-1 hover:text-white/70 transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5 text-[#d4ff00] inline" /> <span className="font-semibold text-white/70">{quote.venue_name}</span>
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
                        <MapPin className="h-3.5 w-3.5 text-[#d4ff00] inline" /> <span className="font-semibold text-white">{quote.venue_name}</span>
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
