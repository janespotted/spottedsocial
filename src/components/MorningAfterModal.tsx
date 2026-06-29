import { useState, useEffect } from 'react';
import { X, ChevronRight, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCity } from '@/hooks/useUserCity';
import { getMorningAfterWindow, formatLocalTime } from '@/lib/morning-after';
import { resolvePostImageUrls } from '@/lib/storage-utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';

interface MorningAfterModalProps {
  open: boolean;
  onClose: () => void;
}

interface CheckinData {
  venue_name: string;
  venue_id: string | null;
  started_at: string;
  ended_at: string | null;
}

interface YapData {
  id: string;
  text: string;
  image_url: string | null;
  author_handle: string;
  venue_name: string;
  score: number;
  comments_count: number;
  created_at: string;
  is_anonymous: boolean;
}

interface PostData {
  id: string;
  text: string;
  image_url: string | null;
  media_type: string | null;
  venue_name: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
}

interface CrossedPath {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  venue_name: string;
  started_at: string;
}

interface FriendActivity {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  venue_name: string;
  started_at: string;
}

function getDayLabel(): string {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} morning`;
}

export function MorningAfterModal({ open, onClose }: MorningAfterModalProps) {
  const { user } = useAuth();
  const { city } = useUserCity();

  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<CheckinData[]>([]);
  const [yaps, setYaps] = useState<YapData[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [crossedPaths, setCrossedPaths] = useState<CrossedPath[]>([]);
  const [friendActivity, setFriendActivity] = useState<FriendActivity[]>([]);
  const [heroStart, setHeroStart] = useState<string | null>(null);
  const [heroEnd, setHeroEnd] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) fetchData();
  }, [open, user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const window = getMorningAfterWindow(city);

    try {
      const [checkinsResult, yapsResult, postsResult, sentFriends, receivedFriends] = await Promise.all([
        supabase
          .from('checkins')
          .select('venue_name, venue_id, started_at, ended_at')
          .eq('user_id', user.id)
          .gte('started_at', window.start)
          .lt('started_at', window.end)
          .eq('is_demo', false)
          .order('started_at', { ascending: true }),
        supabase.rpc('get_morning_after_yaps', {
          p_user_id: user.id,
          p_window_start: window.start,
          p_window_end: window.end,
        }),
        supabase.rpc('get_morning_after_user_posts', {
          p_user_id: user.id,
          p_window_start: window.start,
          p_window_end: window.end,
        }),
        supabase.from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'accepted'),
        supabase.from('friendships').select('user_id').eq('friend_id', user.id).eq('status', 'accepted'),
      ]);

      const userCheckins: CheckinData[] = checkinsResult.data || [];
      setCheckins(userCheckins);
      setYaps(yapsResult.data || []);
      const resolvedPosts = await resolvePostImageUrls(postsResult.data || []);
      setPosts(resolvedPosts);

      if (userCheckins.length > 0) {
        setHeroStart(userCheckins[0].started_at);
        const lastCheckin = userCheckins[userCheckins.length - 1];
        setHeroEnd(lastCheckin.ended_at || lastCheckin.started_at);
      }

      const friendIds = [
        ...(sentFriends.data?.map(f => f.friend_id) || []),
        ...(receivedFriends.data?.map(f => f.user_id) || []),
      ];

      if (friendIds.length > 0) {
        const { data: friendCheckins } = await supabase
          .from('checkins')
          .select('user_id, venue_name, venue_id, started_at, ended_at')
          .in('user_id', friendIds)
          .gte('started_at', window.start)
          .lt('started_at', window.end)
          .eq('is_demo', false)
          .order('started_at', { ascending: true });

        const friendUserIds = [...new Set((friendCheckins || []).map(c => c.user_id))];
        let profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();

        if (friendUserIds.length > 0) {
          const { data: profiles } = await supabase.rpc('get_profiles_safe');
          if (profiles) {
            profileMap = new Map(profiles.map((p: any) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]));
          }
        }

        const userVenueWindows = userCheckins.map(c => ({
          venue_id: c.venue_id,
          start: new Date(c.started_at).getTime(),
          end: new Date(c.ended_at || window.end).getTime(),
        }));

        const crossed: CrossedPath[] = [];
        const allFriendActivity: FriendActivity[] = [];

        for (const fc of (friendCheckins || [])) {
          const profile = profileMap.get(fc.user_id);
          if (!profile) continue;

          const entry = {
            user_id: fc.user_id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            venue_name: fc.venue_name,
            started_at: fc.started_at,
          };

          allFriendActivity.push(entry);

          const fcStart = new Date(fc.started_at).getTime();
          const fcEnd = new Date(fc.ended_at || window.end).getTime();

          for (const uv of userVenueWindows) {
            if (fc.venue_id === uv.venue_id && fcStart < uv.end && fcEnd > uv.start) {
              crossed.push(entry);
              break;
            }
          }
        }

        const crossedKey = new Set<string>();
        setCrossedPaths(crossed.filter(c => {
          const key = `${c.user_id}-${c.venue_name}`;
          if (crossedKey.has(key)) return false;
          crossedKey.add(key);
          return true;
        }));

        const friendMap = new Map<string, FriendActivity>();
        for (const fa of allFriendActivity) {
          friendMap.set(fa.user_id, fa);
        }
        setFriendActivity(Array.from(friendMap.values()));
      }
    } catch (err) {
      console.error('[MorningAfter] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const yapsByVenue = new Map<string, YapData[]>();
  for (const yap of yaps) {
    const arr = yapsByVenue.get(yap.venue_name) || [];
    arr.push(yap);
    yapsByVenue.set(yap.venue_name, arr.slice(0, 5));
  }

  const stayedIn = checkins.length === 0;

  // Timeline progress bar calculation
  const getTimelineProgress = () => {
    if (!heroStart || !heroEnd) return { startPct: 0, endPct: 100 };
    const windowStart = new Date(getMorningAfterWindow(city).start).getTime(); // 5pm
    const windowEnd = new Date(getMorningAfterWindow(city).end).getTime();     // 5am
    const totalMs = windowEnd - windowStart;
    const startPct = Math.max(0, Math.min(100, ((new Date(heroStart).getTime() - windowStart) / totalMs) * 100));
    const endPct = Math.max(0, Math.min(100, ((new Date(heroEnd).getTime() - windowStart) / totalMs) * 100));
    return { startPct, endPct };
  };

  const { startPct, endPct } = getTimelineProgress();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[200] bg-[#0a0a0a] overflow-y-auto"
        >
          {/* Safe area spacer */}
          <div style={{ height: 'env(safe-area-inset-top, 0px)' }} className="bg-[#0a0a0a]" />

          <div className="px-5 pb-16">
            {/* Header */}
            <div className="flex items-start justify-between pt-4 pb-6">
              <div>
                <h1 className="text-[32px] font-bold text-white leading-none tracking-tight">Morning After</h1>
                <p className="text-sm text-white/40 mt-1.5">{getDayLabel()} · last night's recap</p>
              </div>
              <button onClick={onClose} className="mt-1 p-1 text-white/50 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-white/10 border-t-[#d4ff00] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-8">
                {/* ── Hero Card ── */}
                {!stayedIn && heroStart && heroEnd && (
                  <div className="bg-[#141414] rounded-2xl p-5">
                    <p className="text-sm text-white/50 mb-1">You went out from</p>
                    <p className="text-[28px] font-bold text-[#d4ff00] leading-tight tracking-tight">
                      {formatLocalTime(heroStart, city).toUpperCase()} to {formatLocalTime(heroEnd, city).toUpperCase()}
                    </p>

                    {/* Timeline bar */}
                    <div className="mt-5 mb-2 relative h-1 bg-white/10 rounded-full">
                      <div
                        className="absolute h-1 bg-[#d4ff00] rounded-full"
                        style={{ left: `${startPct}%`, width: `${Math.max(2, endPct - startPct)}%` }}
                      />
                      <div
                        className="absolute w-2.5 h-2.5 bg-[#d4ff00] rounded-full -top-[3px]"
                        style={{ left: `${startPct}%` }}
                      />
                      <div
                        className="absolute w-2.5 h-2.5 bg-[#d4ff00] rounded-full -top-[3px]"
                        style={{ left: `${endPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-white/30">
                      <span>{formatLocalTime(heroStart, city).toUpperCase()}</span>
                      <span>{formatLocalTime(heroEnd, city).toUpperCase()}</span>
                    </div>
                  </div>
                )}

                {stayedIn && (
                  <div className="bg-[#141414] rounded-2xl p-5">
                    <p className="text-xl font-medium text-white">You stayed in last night</p>
                    <p className="text-sm text-white/40 mt-1">here's what your friends were up to</p>
                  </div>
                )}

                {/* ── Where You Went ── */}
                {checkins.length > 0 && (
                  <section>
                    <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-3">Where you went</h2>
                    <div className="space-y-2">
                      {checkins.map((checkin, i) => (
                        <div key={i} className="flex items-center gap-3 bg-[#141414] rounded-2xl p-3 pr-4">
                          {/* Venue thumbnail placeholder */}
                          <div className="w-16 h-16 rounded-xl bg-[#1a1a1a] flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <MapPin className="w-5 h-5 text-white/20" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-[15px] truncate">{checkin.venue_name}</p>
                            <p className="text-xs text-white/40 mt-0.5">
                              {formatLocalTime(checkin.started_at, city).toUpperCase()}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Your Photos ── */}
                {posts.filter(p => p.image_url).length > 0 && (
                  <section>
                    <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-3">Your photos</h2>
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
                      {posts.filter(p => p.image_url).map(post => (
                        <div key={post.id} className="flex-shrink-0 w-44">
                          <div className="rounded-2xl overflow-hidden bg-[#141414]">
                            {post.media_type === 'video' ? (
                              <video src={post.image_url!} className="w-44 h-56 object-cover" playsInline muted />
                            ) : (
                              <img src={post.image_url!} alt="" className="w-44 h-56 object-cover" />
                            )}
                          </div>
                          <p className="text-xs text-white/50 mt-2 truncate">{post.venue_name || post.text || ''}</p>
                          <p className="text-[10px] text-white/25">{formatLocalTime(post.created_at, city).toUpperCase()}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Yaps Per Venue ── */}
                {yapsByVenue.size > 0 && (
                  <section>
                    <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-3">What people were saying</h2>
                    {Array.from(yapsByVenue.entries()).map(([venue, venueYaps]) => (
                      <div key={venue} className="mb-4">
                        <p className="text-sm text-white/50 font-medium mb-2">{venue}</p>
                        <div className="space-y-1.5">
                          {venueYaps.map(yap => (
                            <div key={yap.id} className="bg-[#141414] rounded-xl px-4 py-3">
                              <p className="text-sm text-white">{yap.text}</p>
                              {yap.image_url && (
                                <img src={yap.image_url} alt="" className="mt-2 rounded-lg max-h-40 w-full object-cover" />
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-white/30">
                                  {yap.is_anonymous ? 'anonymous' : `@${yap.author_handle}`}
                                </span>
                                <div className="flex gap-2 text-xs text-white/25">
                                  {yap.score > 0 && <span>+{yap.score}</span>}
                                  {yap.comments_count > 0 && <span>{yap.comments_count} replies</span>}
                                  <span>{formatLocalTime(yap.created_at, city).toUpperCase()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {/* ── Crossed Paths ── */}
                {crossedPaths.length > 0 && (
                  <section>
                    <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-4">You crossed paths with</h2>
                    <div className="flex gap-4 overflow-x-auto pb-2 -mx-5 px-5">
                      {crossedPaths.map((cp, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 w-[80px]">
                          <div className="w-[68px] h-[68px] rounded-full border-[1.5px] border-[#d4ff00]/40 p-[2px]">
                            <Avatar className="w-full h-full">
                              <AvatarImage src={cp.avatar_url || undefined} className="rounded-full" />
                              <AvatarFallback className="bg-[#1a1a1a] text-white text-lg rounded-full">
                                {cp.display_name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-xs text-white/70 text-center truncate w-full">
                            {cp.display_name.split(' ')[0]}
                          </span>
                          <span className="text-[10px] text-white/30 text-center truncate w-full -mt-1">
                            {cp.venue_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Stayed In: Friends Out ── */}
                {stayedIn && friendActivity.length > 0 && (
                  <section>
                    <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-4">Friends who went out</h2>
                    <div className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1">
                      {friendActivity.map((fa, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
                          <div className="w-[72px] h-[72px] rounded-full border-[1.5px] border-white/15 p-[2px]">
                            <Avatar className="w-full h-full">
                              <AvatarImage src={fa.avatar_url || undefined} className="rounded-full" />
                              <AvatarFallback className="bg-[#1a1a1a] text-white text-lg rounded-full">
                                {fa.display_name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-xs text-white/60 text-center max-w-[72px] truncate">
                            {fa.display_name.split(' ')[0]}
                          </span>
                          <span className="text-[10px] text-white/25 text-center max-w-[72px] truncate">
                            {fa.venue_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Night Owl Badge (v1 placeholder) ── */}
                {!stayedIn && heroEnd && (
                  <div className="bg-[#141414] rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#d4ff00]/10 flex items-center justify-center flex-shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Night owl</p>
                      <p className="text-xs text-white/40">
                        {checkins.length} venue{checkins.length !== 1 ? 's' : ''} visited last night
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                  </div>
                )}

                {/* Empty state */}
                {stayedIn && friendActivity.length === 0 && posts.length === 0 && (
                  <div className="text-center py-16">
                    <p className="text-white/25 text-sm">quiet night — nothing to recap</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
