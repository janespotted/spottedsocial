import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, ChevronRight, Mic } from 'lucide-react';
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
  venue_type: string | null;
  venue_neighborhood: string | null;
}

export function YapTab({ venueName: venueNameProp }: YapTabProps) {
  const { user } = useAuth();
  const [view, setView] = useState<'directory' | 'thread'>(venueNameProp ? 'thread' : 'directory');
  const [threadVenueName, setThreadVenueName] = useState<string | null>(venueNameProp || null);
  const [userVenueName, setUserVenueName] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueYapSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // When prop changes, go to that thread
  useEffect(() => {
    if (venueNameProp) {
      setThreadVenueName(venueNameProp);
      setView('thread');
    }
  }, [venueNameProp]);

  // Fetch user's current venue + active yap venues
  useEffect(() => {
    if (view === 'directory') {
      fetchDirectory();
    }
  }, [view, user]);

  const fetchDirectory = async () => {
    setIsLoading(true);
    try {
      // Fetch user's venue in parallel with yap data
      const [userVenueResult, yapResult] = await Promise.all([
        user
          ? supabase
              .from('night_statuses')
              .select('venue_name')
              .eq('user_id', user.id)
              .not('venue_name', 'is', null)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('yap_messages')
          .select('venue_name, score, text')
          .gt('expires_at', new Date().toISOString())
          .eq('is_demo', false),
      ]);

      const currentVenue = userVenueResult.data?.venue_name || null;
      setUserVenueName(currentVenue);

      const yaps = yapResult.data || [];

      // Group by venue
      const venueMap = new Map<string, { count: number; hottestScore: number; hottestText: string }>();
      for (const yap of yaps) {
        const existing = venueMap.get(yap.venue_name);
        if (existing) {
          existing.count++;
          if (yap.score > existing.hottestScore) {
            existing.hottestScore = yap.score;
            existing.hottestText = yap.text;
          }
        } else {
          venueMap.set(yap.venue_name, { count: 1, hottestScore: yap.score, hottestText: yap.text });
        }
      }

      // Fetch venue metadata for enrichment
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

      // Build sorted list
      const summaries: VenueYapSummary[] = [...venueMap.entries()]
        .map(([name, data]) => ({
          venue_name: name,
          post_count: data.count,
          hottest_text: data.hottestText,
          venue_type: venueMetaMap.get(name)?.type || null,
          venue_neighborhood: venueMetaMap.get(name)?.neighborhood || null,
        }))
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

  // Thread view
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

  // Directory view
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl bg-[#2d1b4e]/40" />
        <Skeleton className="h-6 w-40 bg-[#2d1b4e]/40" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl bg-[#2d1b4e]/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Your Venue card */}
      {userVenueName && (
        <button
          onClick={() => openThread(userVenueName)}
          className="w-full bg-[#d4ff00]/10 border border-[#d4ff00]/30 rounded-2xl p-4 flex items-center justify-between active:bg-[#d4ff00]/20 transition-colors"
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

      {/* Active Tonight */}
      {venues.length > 0 ? (
        <>
          <h3 className="text-white font-semibold text-base">Active Tonight 🔥</h3>
          <div className="space-y-2">
            {venues.map((venue) => (
              <button
                key={venue.venue_name}
                onClick={() => openThread(venue.venue_name)}
                className="w-full bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4 flex items-center gap-3 active:bg-[#2d1b4e]/80 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-[15px] truncate">{venue.venue_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {(venue.venue_type || venue.venue_neighborhood) && (
                      <span className="text-white/40 text-xs">
                        {[venue.venue_type, venue.venue_neighborhood].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <span className="text-white/40 text-xs">
                      {venue.venue_type || venue.venue_neighborhood ? ' · ' : ''}{venue.post_count} {venue.post_count === 1 ? 'post' : 'posts'}
                    </span>
                  </div>
                  {venue.hottest_text && (
                    <p className="text-white/50 text-xs mt-1 truncate">"{venue.hottest_text}"</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-white/30 shrink-0" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
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
