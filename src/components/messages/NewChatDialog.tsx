import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open && user) {
      fetchFriends();
    }
  }, [open, user]);

  useEffect(() => {
    // If we have a preselected user, automatically create thread
    if (open && preselectedUser && user) {
      createThreadWithPreselectedUser();
    }
  }, [open, preselectedUser, user]);

  const createThreadWithPreselectedUser = async () => {
    if (!preselectedUser || !user) return;
    await createThread(preselectedUser.id);
  };

  const fetchFriends = async () => {
    // Get accepted friendships
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    if (!friendships || friendships.length === 0) {
      setFriends([]);
      return;
    }

    const friendIds = friendships.map(f => f.friend_id);

    // Get friend profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', friendIds);

    if (!profiles) return;

    // Get their current venues
    const friendsData = await Promise.all(
      profiles.map(async (profile) => {
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
    // Check if thread already exists
    const { data: existingThreads } = await supabase
      .from('dm_thread_members')
      .select('thread_id')
      .eq('user_id', user?.id);

    if (existingThreads) {
      for (const { thread_id } of existingThreads) {
        const { data: members } = await supabase
          .from('dm_thread_members')
          .select('user_id')
          .eq('thread_id', thread_id);

        if (members && members.length === 2) {
          const memberIds = members.map(m => m.user_id);
          if (memberIds.includes(friendId) && memberIds.includes(user!.id)) {
            // Thread exists, navigate to it
            onOpenChange(false);
            navigate(`/messages/${thread_id}`);
            return;
          }
        }
      }
    }

    // Create new thread
    const { data: newThread } = await supabase
      .from('dm_threads')
      .insert({})
      .select()
      .single();

    if (!newThread) return;

    // Add both users as members
    await supabase.from('dm_thread_members').insert([
      { thread_id: newThread.id, user_id: user!.id },
      { thread_id: newThread.id, user_id: friendId },
    ]);

    onOpenChange(false);
    navigate(`/messages/${newThread.id}`);
  };

  const filteredFriends = friends.filter(
    (friend) =>
      friend.display_name.toLowerCase().includes(search.toLowerCase()) ||
      friend.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white">
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
      </DialogContent>
    </Dialog>
  );
}
