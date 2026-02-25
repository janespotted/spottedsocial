import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ChevronRight, Mic } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { cn } from '@/lib/utils';
import { VenueYapThread } from './VenueYapThread';
import { Skeleton } from '@/components/ui/skeleton';

interface YapTabProps {
  venueName?: string;
}

interface VenueYapSummary {
  venue_name: string;
  post_count: number;
  hottest_text: string | null;
  hottest_score: number;
  venue_type: string | null;
  venue_neighborhood: string | null;
  top_quotes: { text: string; score: number }[];
}

export function YapTab({ venueName: venueNameProp }: YapTabProps) {
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const [view, setView] = useState<'directory' | 'thread'>(venueNameProp ? 'thread' : 'directory');
  const [threadVenueName, setThreadVenueName] = useState<string | null>(venueNameProp || null);
  const [userVenueName, setUserVenueName] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueYapSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (venueNameProp) {
      setThreadVenueName(venueNameProp);
      setView('thread');
    }
  }, [venueNameProp]);

  useEffect(() => {
    if (view === 'directory') {
      fetchDirectory();
    }
  }, [view, user, demoEnabled]);

  const fetchDirectory = async () => {
    setIsLoading(true);
    try {
      const [userVenueResult, yapResult] = await Promise.all([
        user
          ? supabase
              .from('night_statuses')
              .select('venue_name')
              .eq('user_id', user.id)
              .not('venue_name', 'is', null)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        (() => {
          let yapQuery = supabase
            .from('yap_messages')
            .select('venue_name, score, text')
            .gt('expires_at', new Date().toISOString());
          if (!demoEnabled) {
            yapQuery = yapQuery.eq('is_demo', false);
          }
          return yapQuery;
        })(),
      ]);

      const currentVenue = userVenueResult.data?.venue_name || null;
      setUserVenueName(currentVenue);

      const yaps = yapResult.data || [];

      // Group by venue — collect top quotes
      const venueMap = new Map<string, { count: number; quotes: { text: string; score: number }[] }>();
      for (const yap of yaps) {
        const existing = venueMap.get(yap.venue_name);
        if (existing) {
          existing.count++;
          existing.quotes.push({ text: yap.text, score: yap.score });
        } else {
          venueMap.set(yap.venue_name, { count: 1, quotes: [{ text: yap.text, score: yap.score }] });
        }
      }

      const venueNames = [...venueMap.keys()];
      let venueMetaMap = new Map<string, { type: string | null; neighborhood: string | null }>();

      if (venueNames.length > 0) {
        const { data: venueData } = await supabase
          .from('venues')
          .select('name, type, neighborhood')
          .in('name', venueNames);

        if (venueData) {
          for (const v of venueData) {
            venueMetaMap.set(v.name, { type: v.type, neighborhood: v.neighborhood });
          }
        }
      }

      const summaries: VenueYapSummary[] = [...venueMap.entries()]
        .map(([name, data]) => {
          const sortedQuotes = data.quotes.sort((a, b) => b.score - a.score);
          return {
            venue_name: name,
            post_count: data.count,
            hottest_text: sortedQuotes[0]?.text || null,
            hottest_score: sortedQuotes[0]?.score || 0,
            venue_type: venueMetaMap.get(name)?.type || null,
            venue_neighborhood: venueMetaMap.get(name)?.neighborhood || null,
            top_quotes: sortedQuotes.slice(0, 3),
          };
        })
        .sort((a, b) => b.post_count - a.post_count);

      setVenues(summaries);
    } catch (error) {
      console.error('Error fetching yap directory:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
      <div className="space-y-5">
        <Skeleton className="h-36 w-full rounded-2xl bg-[#2d1b4e]/40" />
        <Skeleton className="h-6 w-48 bg-[#2d1b4e]/40" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl bg-[#2d1b4e]/40" />
        ))}
      </div>
    );
  }

  const hottestVenue = venues.length > 0 ? venues[0] : null;
  const remainingVenues = venues.slice(1);

  // Border thickness based on activity
  const getBorderWidth = (postCount: number) => {
    if (postCount >= 10) return 'border-l-[6px]';
    if (postCount >= 5) return 'border-l-[4px]';
    return 'border-l-[3px]';
  };

  const getActivityEmoji = (postCount: number) => {
    if (postCount >= 5) return '🔥';
    return '✦';
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Your Venue card */}
      {userVenueName && (
        <button
          onClick={() => openThread(userVenueName)}
          className="w-full bg-[#d4ff00]/10 border border-[#d4ff00]/30 rounded-2xl p-4 flex items-center justify-between active:bg-[#d4ff00]/20 transition-colors animate-fade-in"
        >
          <div className="text-left">
            <p className="text-[#d4ff00] text-xs font-semibold uppercase tracking-wider mb-1">You're at</p>
            <p className="text-white font-bold text-lg">{userVenueName}</p>
          </div>
          <div className="bg-[#d4ff00] text-[#1a0f2e] font-bold text-sm px-4 py-2 rounded-full">
            Post
          </div>
        </button>
      )}

      {venues.length > 0 ? (
        <>
          {/* 🔥 Hottest Right Now — Featured Card */}
          {hottestVenue && (
            <button
              onClick={() => openThread(hottestVenue.venue_name)}
              className={cn(
                'w-full text-left rounded-2xl p-5 relative overflow-hidden',
                'bg-gradient-to-br from-[#3d1f6e] via-[#2d1b4e] to-[#1a0f2e]',
                'border border-[#a855f7]/30',
                'active:scale-[0.98] transition-all duration-200',
                'animate-fade-in',
                'shadow-[0_0_30px_rgba(168,85,247,0.15)]'
              )}
              style={{ animationDelay: '50ms' }}
            >
              {/* Animated glow overlay */}
              <div className="absolute inset-0 rounded-2xl opacity-30 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at 30% 20%, rgba(168,85,247,0.25) 0%, transparent 60%)',
                }}
              />
              {/* Pulsing border accent */}
              <div className="absolute left-0 top-0 bottom-0 w-[6px] rounded-l-2xl bg-gradient-to-b from-[#d4ff00] to-[#a855f7] animate-pulse" />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">🔥</span>
                  <span className="text-[#d4ff00] text-xs font-bold uppercase tracking-widest">Hottest Right Now</span>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-bold text-xl">{hottestVenue.venue_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {(hottestVenue.venue_type || hottestVenue.venue_neighborhood) && (
                        <span className="text-white/40 text-xs">
                          {[hottestVenue.venue_type, hottestVenue.venue_neighborhood].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <span className="text-white/40 text-xs">
                        {hottestVenue.venue_type || hottestVenue.venue_neighborhood ? ' · ' : ''}
                        {getActivityEmoji(hottestVenue.post_count)} {hottestVenue.post_count} {hottestVenue.post_count === 1 ? 'post' : 'posts'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/30 shrink-0" />
                </div>

                {/* Top quotes */}
                {hottestVenue.top_quotes.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-white/10">
                    {hottestVenue.top_quotes.map((quote, i) => (
                      <p key={i} className="text-white/70 text-sm leading-relaxed truncate">
                        "{quote.text}"
                        {quote.score > 0 && (
                          <span className="text-[#d4ff00] ml-1.5 text-xs font-semibold">▲ {quote.score}</span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )}

          {/* Active Tonight */}
          {remainingVenues.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold text-base">Active Tonight</h3>
                <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-full">
                  {remainingVenues.length} {remainingVenues.length === 1 ? 'venue' : 'venues'}
                </span>
              </div>
              <div className="space-y-3">
                {remainingVenues.map((venue, index) => (
                  <button
                    key={venue.venue_name}
                    onClick={() => openThread(venue.venue_name)}
                    className={cn(
                      'w-full text-left rounded-2xl p-4 relative overflow-hidden',
                      'bg-gradient-to-r from-[#2d1b4e]/80 to-[#1f1338]/60',
                      'border border-[#a855f7]/15',
                      getBorderWidth(venue.post_count),
                      venue.post_count >= 5 ? 'border-l-[#d4ff00]' : 'border-l-[#a855f7]/60',
                      'active:bg-[#2d1b4e]/90 transition-all duration-200',
                      'hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]',
                      'animate-fade-in'
                    )}
                    style={{ animationDelay: `${(index + 1) * 60}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-[15px] truncate">{venue.venue_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {(venue.venue_type || venue.venue_neighborhood) && (
                            <span className="text-white/35 text-xs">
                              {[venue.venue_type, venue.venue_neighborhood].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          <span className="text-white/35 text-xs">
                            {venue.venue_type || venue.venue_neighborhood ? ' · ' : ''}
                            {getActivityEmoji(venue.post_count)} {venue.post_count} {venue.post_count === 1 ? 'post' : 'posts'}
                          </span>
                        </div>
                        {venue.hottest_text && (
                          <p className="text-white/60 text-[13px] mt-1.5 truncate leading-relaxed">
                            "{venue.hottest_text}"
                            {venue.hottest_score > 0 && (
                              <span className="text-[#d4ff00] ml-1.5 text-xs font-semibold">▲ {venue.hottest_score}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-white/20 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6 border border-[#a855f7]/20">
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
