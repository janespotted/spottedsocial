import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

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

interface FriendSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ORDER: Record<string, number> = { out: 0, planning: 1, home: 2 };

export function FriendSearchModal({ open, onOpenChange }: FriendSearchModalProps) {
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && user) {
      fetchFriends();
    }
    if (!open) setSearch('');
  }, [open, user]);

  const fetchFriends = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Step 1: Get friend IDs (2 parallel queries)
      const [sentResult, receivedResult] = await Promise.all([
        supabase.from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'accepted'),
        supabase.from('friendships').select('user_id').eq('friend_id', user.id).eq('status', 'accepted'),
      ]);

      const friendIds = [...new Set([
        ...(sentResult.data?.map(f => f.friend_id) || []),
        ...(receivedResult.data?.map(f => f.user_id) || []),
      ])];

      if (friendIds.length === 0) {
        setFriends([]);
        setIsLoading(false);
        return;
      }

      // Step 2: Batch all data queries in parallel (4 queries total)
      const now = new Date().toISOString();
      let profileQuery = supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, is_demo')
        .in('id', friendIds);
      if (!demoEnabled) profileQuery = profileQuery.eq('is_demo', false);

      const [profilesRes, checkinsRes, nightRes, storiesRes] = await Promise.all([
        profileQuery,
        supabase.from('checkins').select('user_id, venue_name').in('user_id', friendIds).is('ended_at', null),
        supabase.from('night_statuses').select('user_id, status, planning_neighborhood').in('user_id', friendIds).not('expires_at', 'is', null).gt('expires_at', now),
        supabase.from('stories').select('user_id').in('user_id', friendIds).gt('expires_at', now),
      ]);

      if (!profilesRes.data) { setFriends([]); setIsLoading(false); return; }

      // Build lookup maps
      const checkinMap = new Map<string, string>();
      checkinsRes.data?.forEach(c => { if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, c.venue_name); });

      const nightMap = new Map<string, { status: string; planning_neighborhood: string | null }>();
      nightRes.data?.forEach(n => { if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n); });

      const storySet = new Set<string>();
      storiesRes.data?.forEach(s => storySet.add(s.user_id));

      // Build friends array
      const friendsData: Friend[] = profilesRes.data.map(profile => {
        let status: 'out' | 'planning' | 'home' = 'home';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;

        const activeCheckin = checkinMap.get(profile.id);
        const nightStatus = nightMap.get(profile.id);

        if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin;
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

      // Sort: out → planning → home, then alphabetical
      friendsData.sort((a, b) => {
        const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return diff !== 0 ? diff : a.display_name.localeCompare(b.display_name);
      });

      setFriends(friendsData);
    } catch (error) {
      console.error('Error fetching friends:', error);
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

  const filteredFriends = useMemo(() =>
    friends.filter(f =>
      f.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
    ), [friends, search]);

  const outCount = friends.filter(f => f.status === 'out').length;
  const planningCount = friends.filter(f => f.status === 'planning').length;

  const getAvatarRing = (status: string) => {
    if (status === 'out') return 'ring-2 ring-[#d4ff00]/50';
    if (status === 'planning') return 'ring-2 ring-[#a855f7]/40';
    return 'ring-1 ring-white/10';
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="bg-[#0a0118] border-t border-white/10 max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-foreground text-center text-base">Find Friends</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends..."
              className="bg-white/5 border-white/10 text-foreground placeholder:text-white/30 rounded-xl pl-10 h-10 text-sm"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-white/30 hover:text-white/50" />
              </button>
            )}
          </div>

          {/* Status summary */}
          {!isLoading && friends.length > 0 && (outCount > 0 || planningCount > 0) && (
            <div className="flex items-center gap-2 mt-2.5 px-1">
              {outCount > 0 && (
                <span className="text-[11px] text-[#d4ff00]/70">{outCount} out</span>
              )}
              {outCount > 0 && planningCount > 0 && (
                <span className="text-white/20">·</span>
              )}
              {planningCount > 0 && (
                <span className="text-[11px] text-[#a855f7]/70">{planningCount} planning</span>
              )}
            </div>
          )}

          {/* Friends List */}
          <div className="flex-1 mt-3 overflow-y-auto space-y-1">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-full bg-white/5" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24 bg-white/5" />
                    <Skeleton className="h-3 w-16 bg-white/5" />
                  </div>
                </div>
              ))
            ) : filteredFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Search className="h-6 w-6 text-white/20 mb-3" />
                <p className="text-sm text-white/40">
                  {search ? 'No friends found' : 'Your friend list is empty'}
                </p>
              </div>
            ) : (
              filteredFriends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => handleSelectFriend(friend)}
                  className="w-full rounded-xl p-3 hover:bg-white/5 transition-colors flex items-center gap-3"
                >
                  <div className={`p-[2px] rounded-full ${
                    friend.has_story
                      ? 'bg-gradient-to-br from-[#d4ff00] via-[#a3e635] to-[#d4ff00]'
                      : 'bg-transparent'
                  }`}>
                    <div className="rounded-full bg-[#0a0118] p-[1px]">
                      <Avatar className={`h-10 w-10 ${getAvatarRing(friend.status)}`}>
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-white/5 text-white/60 text-sm">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <h3 className="font-medium text-sm text-white truncate">{friend.display_name}</h3>
                    <p className="text-white/40 text-xs truncate">@{friend.username}</p>
                  </div>

                  {friend.status === 'out' && friend.venue_name ? (
                    <span className="text-[11px] bg-[#d4ff00]/10 text-[#d4ff00]/80 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                      @ {friend.venue_name}
                    </span>
                  ) : friend.status === 'planning' ? (
                    <span className="text-[11px] bg-[#a855f7]/10 text-[#a855f7]/70 px-2 py-0.5 rounded-full">
                      🎯 Planning
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/20">Home</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
