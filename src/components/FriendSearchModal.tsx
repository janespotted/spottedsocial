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

      const now = new Date().toISOString();
      let profileQuery = supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, is_demo')
        .in('id', friendIds);
      if (!demoEnabled) profileQuery = profileQuery.eq('is_demo', false);

      const [profilesRes, checkinsRes, nightRes, storiesRes] = await Promise.all([
        profileQuery,
        supabase.from('checkins').select('user_id, venue_name').in('user_id', friendIds).is('ended_at', null),
        supabase.from('night_statuses').select('user_id, status, planning_neighborhood, venue_name').in('user_id', friendIds).not('expires_at', 'is', null).gt('expires_at', now),
        supabase.from('stories').select('user_id').in('user_id', friendIds).gt('expires_at', now),
      ]);

      if (!profilesRes.data) { setFriends([]); setIsLoading(false); return; }

      const checkinMap = new Map<string, string>();
      checkinsRes.data?.forEach(c => { if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, c.venue_name); });

      const nightMap = new Map<string, { status: string; planning_neighborhood: string | null; venue_name: string | null }>();
      nightRes.data?.forEach(n => { if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n); });

      const storySet = new Set<string>();
      storiesRes.data?.forEach(s => storySet.add(s.user_id));

      const friendsData: Friend[] = profilesRes.data.map(profile => {
        let status: 'out' | 'planning' | 'home' = 'home';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;

        const activeCheckin = checkinMap.get(profile.id);
        const nightStatus = nightMap.get(profile.id);

        if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin;
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

  const outFriends = filteredFriends.filter(f => f.status === 'out');
  const planningFriends = filteredFriends.filter(f => f.status === 'planning');
  const homeFriends = filteredFriends.filter(f => f.status === 'home');

  const renderFriendRow = (friend: Friend) => (
    <button
      key={friend.id}
      onClick={() => handleSelectFriend(friend)}
      className="w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10 last:border-b-0"
    >
      <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50">
        <AvatarImage src={friend.avatar_url || undefined} />
        <AvatarFallback className="bg-[#a855f7] text-white text-sm">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-white font-semibold text-sm truncate">
          {friend.display_name}
        </p>
        {friend.status === 'out' ? (
          <p className="text-[#d4ff00] text-xs truncate">
            📍 At {friend.venue_name || 'Nearby'}
          </p>
        ) : friend.status === 'planning' ? (
          <p className="text-[#a855f7] text-xs truncate">
            🎯 Planning{friend.planning_neighborhood ? ` (${friend.planning_neighborhood})` : ' tonight'}
          </p>
        ) : (
          <p className="text-white/40 text-xs">Home</p>
        )}
      </div>
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="bg-[#1a0f2e] border-t border-[#a855f7]/30 max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-foreground text-center text-base">Who's Out</DrawerTitle>
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

          {/* Friends List */}
          <div className="flex-1 mt-3 overflow-y-auto">
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
              <div className="bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg overflow-hidden">
                {/* Friends Out Now */}
                {outFriends.length > 0 && (
                  <>
                    <div className="px-3 py-2">
                      <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                        👥 Friends Out Now
                        <span className="text-white/50 ml-1">({outFriends.length})</span>
                      </h3>
                    </div>
                    {outFriends.map(renderFriendRow)}
                  </>
                )}

                {/* Friends Planning */}
                {planningFriends.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
                      <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider">
                        🔥 Friends Planning 🎯
                        <span className="text-white/50 normal-case tracking-normal">({planningFriends.length})</span>
                      </p>
                    </div>
                    {planningFriends.map(renderFriendRow)}
                  </>
                )}

                {/* Staying In */}
                {homeFriends.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
                      <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider">
                        🏠 Staying In
                        <span className="text-white/50 normal-case tracking-normal">({homeFriends.length})</span>
                      </p>
                    </div>
                    {homeFriends.map(renderFriendRow)}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
