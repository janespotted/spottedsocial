import { useState, useEffect } from 'react';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';

interface Friend {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function InviteFriendsModal() {
  const { showInviteModal, closeInviteModal, sendInvites, venueName } = useVenueInvite();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showInviteModal && user) {
      fetchFriends();
    } else {
      setSelectedFriends(new Set());
    }
  }, [showInviteModal, user]);

  const fetchFriends = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch accepted friendships (both directions)
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
        return;
      }

      // Fetch friend profiles (conditionally filter demo users)
      let profileQuery = supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', friendIds);
      
      // Only filter out demo users when demo mode is OFF (bootstrap mode)
      if (!demoEnabled) {
        profileQuery = profileQuery.eq('is_demo', false);
      }
      
      const { data: profiles } = await profileQuery.order('display_name', { ascending: true });

      setFriends(profiles || []);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId);
    } else {
      newSelected.add(friendId);
    }
    setSelectedFriends(newSelected);
  };

  const handleSendInvites = async () => {
    const selected = friends.filter(f => selectedFriends.has(f.id));
    await sendInvites(selected.map(f => ({
      id: f.id,
      displayName: f.display_name,
      avatarUrl: f.avatar_url
    })));
  };

  return (
    <Dialog open={showInviteModal} onOpenChange={(open) => {
      if (!open) {
        closeInviteModal();
        setSelectedFriends(new Set());
      }
    }}>
      <DialogContent className="w-[90%] max-w-[400px] max-h-[80vh] bg-[#1a0f2e]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl p-0 overflow-hidden">
        <div className="p-5">
          {/* Header */}
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Invite Friends</h2>
            <p className="text-sm text-white/60">to {venueName}</p>
          </div>

          {/* Friends List */}
          <ScrollArea className="h-[400px] mb-4">
            {loading ? (
              <div className="text-center text-white/50 py-8">Loading friends...</div>
            ) : friends.length === 0 ? (
              <div className="text-center text-white/50 py-8">No friends found</div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => handleToggleFriend(friend.id)}
                    className="w-full flex items-center gap-3 p-3 bg-[#2d1b4e]/30 rounded-xl hover:bg-[#2d1b4e]/50 transition-colors"
                  >
                    <Checkbox 
                      checked={selectedFriends.has(friend.id)}
                      onCheckedChange={() => handleToggleFriend(friend.id)}
                      className="border-[#a855f7]"
                    />
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} />
                      <AvatarFallback className="bg-[#a855f7] text-white">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-white font-medium flex-1 text-left">
                      {friend.display_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Send Button */}
          <Button
            onClick={handleSendInvites}
            disabled={selectedFriends.size === 0}
            className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Invites {selectedFriends.size > 0 && `(${selectedFriends.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
