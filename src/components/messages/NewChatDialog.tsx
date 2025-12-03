import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  venue_name: string | null;
}

interface PreselectedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedUser?: PreselectedUser | null;
}

export function NewChatDialog({ open, onOpenChange, preselectedUser }: NewChatDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchFriends();
    }
  }, [open, user]);

  useEffect(() => {
    // If we have a preselected user, automatically create thread
    if (open && preselectedUser && user) {
      setIsCreatingThread(true);
      createThreadWithPreselectedUser();
    }
  }, [open, preselectedUser, user]);

  useEffect(() => {
    if (!open) {
      setIsCreatingThread(false);
    }
  }, [open]);

  const createThreadWithPreselectedUser = async () => {
    if (!preselectedUser || !user) return;
    await createThread(preselectedUser.id);
  };

  const fetchFriends = async () => {
    // Get accepted friendships (both directions)
    const { data: sentFriendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const { data: receivedFriendships } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('friend_id', user?.id)
      .eq('status', 'accepted');

    const friendIds = [
      ...(sentFriendships?.map(f => f.friend_id) || []),
      ...(receivedFriendships?.map(f => f.user_id) || [])
    ];

    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }

    // Get friend profiles (conditionally filter demo users)
    let profileQuery = supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', friendIds);
    
    // Only filter out demo users when demo mode is OFF (bootstrap mode)
    if (!demoEnabled) {
      profileQuery = profileQuery.eq('is_demo', false);
    }
    
    const { data: profiles } = await profileQuery;

    if (!profiles) return;

    // Deduplicate by display_name (keeps first occurrence)
    const seenNames = new Set<string>();
    const uniqueProfiles = profiles.filter(profile => {
      if (seenNames.has(profile.display_name)) {
        return false;
      }
      seenNames.add(profile.display_name);
      return true;
    });

    // Get their current venues
    const friendsData = await Promise.all(
      uniqueProfiles.map(async (profile) => {
        const { data: status } = await supabase
          .from('night_statuses')
          .select('venue_name')
          .eq('user_id', profile.id)
          .maybeSingle();

        return {
          ...profile,
          venue_name: status?.venue_name || null,
        };
      })
    );

    setFriends(friendsData);
  };

  const createThread = async (friendId: string) => {
    try {
      // Step 1: Get all thread IDs where current user is a member
      const { data: myThreads } = await supabase
        .from('dm_thread_members')
        .select('thread_id')
        .eq('user_id', user?.id);

      if (myThreads && myThreads.length > 0) {
        const myThreadIds = myThreads.map(t => t.thread_id);

        // Step 2: Single query - find if friend is in any of my threads
        const { data: friendInThread } = await supabase
          .from('dm_thread_members')
          .select('thread_id')
          .eq('user_id', friendId)
          .in('thread_id', myThreadIds)
          .limit(1)
          .maybeSingle();

        if (friendInThread) {
          // Thread exists, navigate to it
          onOpenChange(false);
          navigate(`/messages/${friendInThread.thread_id}`);
          return;
        }
      }

      // Step 3: No existing thread found, create new one
      const { data: newThread, error: threadError } = await supabase
        .from('dm_threads')
        .insert({})
        .select()
        .single();

      if (threadError || !newThread) {
        throw new Error('Failed to create thread');
      }

      // Step 4: Add both users as members
      const { error: membersError } = await supabase
        .from('dm_thread_members')
        .insert([
          { thread_id: newThread.id, user_id: user!.id },
          { thread_id: newThread.id, user_id: friendId },
        ]);

      if (membersError) {
        throw new Error('Failed to add members to thread');
      }

      onOpenChange(false);
      navigate(`/messages/${newThread.id}`);
    } catch (error) {
      console.error('Error in createThread:', error);
      setIsCreatingThread(false);
    }
  };

  const filteredFriends = friends.filter(
    (friend) =>
      friend.display_name.toLowerCase().includes(search.toLowerCase()) ||
      friend.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white">
        {isCreatingThread ? (
          <div className="py-12 text-center">
            <div className="animate-pulse text-white/60">
              Opening chat with {preselectedUser?.display_name}...
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">New Message</DialogTitle>
            </DialogHeader>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends..."
                className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full pl-12"
              />
            </div>

            {/* Friends List */}
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {filteredFriends.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No friends found</p>
                  <p className="text-white/40 text-sm mt-2">
                    Add friends to start messaging
                  </p>
                </div>
              ) : (
                filteredFriends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => createThread(friend.id)}
                    className="w-full bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-xl p-4 hover:bg-[#2d1b4e]/80 transition-colors flex items-center gap-3"
                  >
                    <Avatar className="h-12 w-12 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 text-left min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {friend.display_name}
                      </h3>
                      <p className="text-white/60 text-sm truncate">
                        @{friend.username}
                      </p>
                    </div>

                    {friend.venue_name && (
                      <div className="text-[#d4ff00] text-sm font-medium">
                        @{friend.venue_name}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
