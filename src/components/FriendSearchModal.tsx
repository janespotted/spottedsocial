import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
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
  }, [open, user]);

  const fetchFriends = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get accepted friendships (both directions)
      const { data: sentFriendships } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      const { data: receivedFriendships } = await supabase
        .from('friendships')
        .select('user_id')
        .eq('friend_id', user.id)
        .eq('status', 'accepted');

      const friendIds = [
        ...(sentFriendships?.map(f => f.friend_id) || []),
        ...(receivedFriendships?.map(f => f.user_id) || [])
      ];

      if (friendIds.length === 0) {
        setFriends([]);
        setIsLoading(false);
        return;
      }

      // Get friend profiles
      let profileQuery = supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, is_demo')
        .in('id', friendIds)
        .order('display_name');

      if (!demoEnabled) {
        profileQuery = profileQuery.eq('is_demo', false);
      }

      const { data: profiles } = await profileQuery;

      if (!profiles) {
        setFriends([]);
        setIsLoading(false);
        return;
      }

      // Get their statuses
      const friendsData = await Promise.all(
        profiles.map(async (profile) => {
          // Check for active check-in
          const { data: activeCheckIn } = await supabase
            .from('checkins')
            .select('venue_name')
            .eq('user_id', profile.id)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Check for night status (planning)
          const { data: nightStatus } = await supabase
            .from('night_statuses')
            .select('status, planning_neighborhood, venue_name')
            .eq('user_id', profile.id)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

          // Check for stories
          const { data: stories } = await supabase
            .from('stories')
            .select('id')
            .eq('user_id', profile.id)
            .gt('expires_at', new Date().toISOString())
            .limit(1);

          let status: 'out' | 'planning' | 'home' = 'home';
          let venue_name = null;
          let planning_neighborhood = null;

          if (activeCheckIn?.venue_name) {
            status = 'out';
            venue_name = activeCheckIn.venue_name;
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
            has_story: (stories && stories.length > 0) || false,
          };
        })
      );

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

  const filteredFriends = friends.filter(
    (friend) =>
      friend.display_name.toLowerCase().includes(search.toLowerCase()) ||
      friend.username.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (friend: Friend) => {
    if (friend.status === 'out' && friend.venue_name) {
      return (
        <span className="text-xs bg-[#d4ff00]/20 text-[#d4ff00] px-2 py-0.5 rounded-full truncate max-w-[120px]">
          @ {friend.venue_name}
        </span>
      );
    }
    if (friend.status === 'planning') {
      return (
        <span className="text-xs bg-[#a855f7]/20 text-[#a855f7] px-2 py-0.5 rounded-full">
          🎯 Planning
        </span>
      );
    }
    return (
      <span className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full">
        In for the night
      </span>
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-transparent max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-foreground text-center">Find Friends</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends..."
              className="bg-background/30 border-border/30 text-foreground placeholder:text-muted-foreground rounded-full pl-12 h-11"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-white/40 hover:text-white/60" />
              </button>
            )}
          </div>

          {/* Friends List */}
          <div className="flex-1 mt-4 overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-pulse text-white/60">Loading friends...</div>
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-4 border border-[#a855f7]/20">
                  <Search className="h-8 w-8 text-[#a855f7]/60" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {search ? 'No friends found' : 'Your friend list is empty'}
                </h3>
                <p className="text-white/50 text-sm max-w-xs">
                  {search ? 'Try a different search' : 'Invite your crew to get started.'}
                </p>
              </div>
            ) : (
              filteredFriends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => handleSelectFriend(friend)}
                  className="w-full bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-xl p-4 hover:bg-[#2d1b4e]/80 transition-colors flex items-center gap-3"
                >
                  {/* Avatar with story ring */}
                  <div className={`p-[2px] rounded-full ${
                    friend.has_story 
                      ? 'bg-gradient-to-br from-[#d4ff00] via-[#a3e635] to-[#d4ff00]' 
                      : 'bg-transparent'
                  }`}>
                    <div className="rounded-full bg-[#0a0118] p-[1px]">
                      <Avatar className="h-12 w-12 border-2 border-[#a855f7]">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {friend.display_name}
                    </h3>
                    <p className="text-white/60 text-sm truncate">
                      @{friend.username}
                    </p>
                  </div>

                  {getStatusBadge(friend)}
                </button>
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
