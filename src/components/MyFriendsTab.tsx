import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { supabase } from '@/integrations/supabase/client';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, MapPin, Target, Megaphone, Check } from 'lucide-react';
import { toast } from 'sonner';
import { triggerPushNotification } from '@/lib/push-notifications';

interface FriendWithStatus {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  status: 'out' | 'planning' | 'hidden';
  venue_name: string | null;
  planning_neighborhood: string | null;
  is_private_party?: boolean;
  party_neighborhood?: string | null;
}

const STATUS_ORDER: Record<string, number> = { out: 0, planning: 1, hidden: 2 };

export function MyFriendsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const [friends, setFriends] = useState<FriendWithStatus[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [ralliedIds, setRalliedIds] = useState<Set<string>>(new Set());

  // Get current user's display name for rally message
  const currentUserProfile = useMemo(() => {
    if (!allProfiles || !user) return null;
    return allProfiles.find((p: any) => p.id === user.id);
  }, [allProfiles, user]);

  const handleRally = useCallback(async (friendId: string) => {
    if (!user || ralliedIds.has(friendId)) return;
    const senderName = currentUserProfile?.display_name || 'Someone';
    try {
      const message = `${senderName} wants you to rally. Come out tonight! 👋`;
      const { data: notifData, error } = await supabase.rpc('create_notification', {
        p_receiver_id: friendId,
        p_type: 'rally',
        p_message: message,
      });
      if (error) throw error;
      
      const notif = Array.isArray(notifData) ? notifData[0] : notifData;
      if (notif) {
        triggerPushNotification({
          id: notif.id,
          receiver_id: friendId,
          sender_id: user.id,
          type: 'rally',
          message,
        });
      }
      
      setRalliedIds(prev => new Set(prev).add(friendId));
      toast.success('Rally sent! 📣');
    } catch (err) {
      console.error('Rally failed:', err);
      toast.error('Could not send rally');
    }
  }, [user, ralliedIds, currentUserProfile]);

  const friendProfiles = useMemo(() => {
    if (!allProfiles || !friendIds) return [];
    const friendSet = new Set(friendIds);
    let filtered = allProfiles.filter((p: any) => friendSet.has(p.id));
    if (!demoEnabled) filtered = filtered.filter((p: any) => !p.is_demo);
    return filtered;
  }, [allProfiles, friendIds, demoEnabled]);

  useEffect(() => {
    if (user && friendProfiles.length > 0) {
      fetchStatuses();
    } else if (friendProfiles.length === 0 && allProfiles) {
      setFriends([]);
      setIsLoading(false);
    }
  }, [user, friendProfiles]);

  const fetchStatuses = useCallback(async () => {
    if (!user || friendProfiles.length === 0) { setFriends([]); setIsLoading(false); return; }
    setIsLoading(true);

    try {
      const ids = friendProfiles.map((p: any) => p.id);
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [checkinsRes, nightRes] = await Promise.all([
        supabase.from('checkins').select('user_id, venue_name, started_at').in('user_id', ids).is('ended_at', null).gt('started_at', twentyFourHoursAgo),
        supabase.from('night_statuses').select('user_id, status, planning_neighborhood, venue_name, updated_at, is_private_party, party_neighborhood').in('user_id', ids).not('expires_at', 'is', null).gt('expires_at', now),
      ]);

      const checkinMap = new Map<string, { venue_name: string; started_at: string | null }>();
      checkinsRes.data?.forEach(c => { if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, { venue_name: c.venue_name, started_at: c.started_at }); });

      const nightMap = new Map<string, { status: string; planning_neighborhood: string | null; venue_name: string | null; updated_at: string | null; is_private_party: boolean | null; party_neighborhood: string | null }>();
      nightRes.data?.forEach(n => { if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n); });

      const friendsData: FriendWithStatus[] = friendProfiles.map((profile: any) => {
        let status: 'out' | 'planning' | 'hidden' = 'hidden';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;
        let is_private_party = false;
        let party_neighborhood: string | null = null;

        const activeCheckin = checkinMap.get(profile.id);
        const nightStatus = nightMap.get(profile.id);

        // Compare timestamps — prefer whichever is more recent
        const checkinTime = activeCheckin?.started_at ? new Date(activeCheckin.started_at).getTime() : 0;
        const nightTime = nightStatus?.updated_at ? new Date(nightStatus.updated_at).getTime() : 0;

        if (nightStatus && nightTime >= checkinTime) {
          if (nightStatus.status === 'out') {
            status = 'out';
            if (nightStatus.is_private_party) {
              is_private_party = true;
              party_neighborhood = nightStatus.party_neighborhood;
              venue_name = 'Private Party';
            } else {
              venue_name = nightStatus.venue_name || null;
            }
          } else if (nightStatus.status === 'planning') {
            status = 'planning';
            planning_neighborhood = nightStatus.planning_neighborhood;
          }
        } else if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin.venue_name;
        } else if (nightStatus) {
          if (nightStatus.status === 'out') {
            status = 'out';
            if (nightStatus.is_private_party) {
              is_private_party = true;
              party_neighborhood = nightStatus.party_neighborhood;
              venue_name = 'Private Party';
            } else {
              venue_name = nightStatus.venue_name || null;
            }
          } else if (nightStatus.status === 'planning') {
            status = 'planning';
            planning_neighborhood = nightStatus.planning_neighborhood;
          }
        }

        return {
          id: profile.id,
          display_name: profile.display_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          status,
          venue_name,
          planning_neighborhood,
          is_private_party,
          party_neighborhood,
        };
      });

      friendsData.sort((a, b) => {
        const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return diff !== 0 ? diff : a.display_name.localeCompare(b.display_name);
      });

      setFriends(friendsData);
    } catch (error) {
      console.error('Error fetching friend statuses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, friendProfiles]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
    await queryClient.invalidateQueries({ queryKey: ['profiles-safe'] });
    await fetchStatuses();
  }, [queryClient, fetchStatuses]);

  const filteredFriends = useMemo(() =>
    friends.filter(f =>
      f.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
    ), [friends, search]);

  const handleSelect = (friend: FriendWithStatus) => {
    openFriendCard({
      userId: friend.id,
      displayName: friend.display_name,
      avatarUrl: friend.avatar_url,
      venueName: friend.venue_name || undefined,
    });
  };

  const outFriends = filteredFriends.filter(f => f.status === 'out');
  const planningFriends = filteredFriends.filter(f => f.status === 'planning');
  const hiddenFriends = filteredFriends.filter(f => f.status === 'hidden');

  const renderRow = (friend: FriendWithStatus) => (
    <button
      key={friend.id}
      onClick={() => handleSelect(friend)}
      className="w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10 last:border-b-0"
    >
      <Avatar className="w-11 h-11 flex-shrink-0 border-2 border-[#a855f7]/50">
        <AvatarImage src={friend.avatar_url || undefined} />
        <AvatarFallback className="bg-[#a855f7] text-white text-sm">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-white font-semibold text-sm truncate">
          {friend.display_name}
        </p>
        <p className="text-white/40 text-xs truncate">@{friend.username}</p>
      </div>

      <div className="flex-shrink-0">
        {friend.status === 'out' ? (
          <span className="flex items-center gap-1 text-[#d4ff00] text-xs font-medium">
            <MapPin className="h-3.5 w-3.5" />
            {friend.is_private_party ? 'Party' : 'Out'}
          </span>
        ) : friend.status === 'planning' ? (
          <span className="flex items-center gap-1 text-[#a855f7] text-xs font-medium">
            <Target className="h-3.5 w-3.5" />
            Planning
          </span>
        ) : ralliedIds.has(friend.id) ? (
          <span className="flex items-center gap-1 text-[#d4ff00]/60 text-xs font-medium">
            <Check className="h-3.5 w-3.5" />
            Rallied
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleRally(friend.id); }}
            className="flex items-center gap-1 text-[#d4ff00] text-xs font-medium hover:text-[#d4ff00]/80 transition-colors"
          >
            <Megaphone className="h-3.5 w-3.5" />
            Rally
          </button>
        )}
      </div>
    </button>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="px-4 py-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends..."
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl pl-10 h-10 text-sm"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5 text-white/30 hover:text-white/50" />
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-11 w-11 rounded-full bg-white/5" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24 bg-white/5" />
              <Skeleton className="h-3 w-16 bg-white/5" />
            </div>
          </div>
        ))
      ) : filteredFriends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-6 w-6 text-white/20 mb-3" />
          <p className="text-sm text-white/40">
            {search ? 'No friends found' : 'No friends yet — start adding people!'}
          </p>
        </div>
      ) : (
        <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl overflow-hidden">
          {outFriends.length > 0 && (
            <>
              <div className="px-3 py-2 bg-[#1a0f2e]/50">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                  👥 Out Now <span className="text-white/50">({outFriends.length})</span>
                </p>
              </div>
              {outFriends.map(renderRow)}
            </>
          )}

          {planningFriends.length > 0 && (
            <>
              <div className="px-3 py-2 bg-[#1a0f2e]/50 border-t border-[#a855f7]/10">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                  🎯 Planning <span className="text-white/50">({planningFriends.length})</span>
                </p>
              </div>
              {planningFriends.map(renderRow)}
            </>
          )}

          {hiddenFriends.length > 0 && (
            <>
              <div className="px-3 py-2 bg-[#1a0f2e]/50 border-t border-[#a855f7]/10">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                  😴 Not sharing <span className="text-white/50">({hiddenFriends.length})</span>
                </p>
              </div>
              {hiddenFriends.map(renderRow)}
            </>
          )}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
