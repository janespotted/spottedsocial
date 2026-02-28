import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Heart } from 'lucide-react';
import { toast } from 'sonner';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  isCloseFriend: boolean;
}

export default function CloseFriends() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchFriends();
    }
  }, [user]);

  const fetchFriends = async () => {
    try {
      // Get all accepted friendships (both directions)
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
        setLoading(false);
        return;
      }

      // Use get_profiles_safe RPC to bypass RLS restrictions on profiles table
      const { data: allSafeProfiles } = await supabase.rpc('get_profiles_safe');
      const profiles = (allSafeProfiles || []).filter((p: any) => friendIds.includes(p.id));

      const filteredProfiles = (bootstrapEnabled && !demoEnabled)
        ? profiles.filter((p: any) => !p.is_demo)
        : profiles;

      // Get close friends list
      const { data: closeFriends } = await supabase
        .from('close_friends')
        .select('close_friend_id')
        .eq('user_id', user?.id);

      const closeFriendIds = new Set(closeFriends?.map(cf => cf.close_friend_id) || []);

      const friendsWithStatus: Friend[] = filteredProfiles.map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
        isCloseFriend: closeFriendIds.has(p.id),
      }));

      setFriends(friendsWithStatus);
    } catch (error) {
      console.error('Error fetching friends:', error);
      toast.error('Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const toggleCloseFriend = async (friendId: string) => {
    const friend = friends.find(f => f.id === friendId);
    if (!friend) return;

    try {
      if (friend.isCloseFriend) {
        // Remove from close friends
        await supabase
          .from('close_friends')
          .delete()
          .eq('user_id', user?.id)
          .eq('close_friend_id', friendId);

        toast.success('Removed from close friends');
      } else {
        // Add to close friends
        await supabase
          .from('close_friends')
          .insert({
            user_id: user?.id,
            close_friend_id: friendId,
          });

        toast.success('Added to close friends 💛');
      }

      // Update local state
      setFriends(friends.map(f => 
        f.id === friendId ? { ...f, isCloseFriend: !f.isCloseFriend } : f
      ));
    } catch (error) {
      console.error('Error toggling close friend:', error);
      toast.error('Failed to update close friends');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <button 
            onClick={() => navigate('/profile/edit')}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold text-white">Close Friends</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6 p-4 bg-white/[0.06] backdrop-blur-sm rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-[#d4ff00]" />
            <h2 className="text-white font-semibold">What are Close Friends?</h2>
          </div>
          <p className="text-sm text-white/60">
            Mark your closest friends here. When you set location sharing to "Close Friends", 
            only people on this list will see where you are.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-white/60 py-8">Loading friends...</div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6">
              <Heart className="h-10 w-10 text-[#d4ff00]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Add friends first
            </h3>
            <p className="text-white/50 text-sm max-w-xs mb-6">
              Once you have friends, you can mark your closest ones here.
            </p>
            <button
              onClick={() => navigate('/friends')}
              className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full px-6 py-2.5 font-medium transition-colors"
            >
              Find Friends
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-4 bg-white/[0.06] backdrop-blur-sm rounded-2xl hover:bg-white/[0.10] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar className="h-12 w-12 border-2 border-[#a855f7] flex-shrink-0">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#1a0f2e] text-white">
                      {friend.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate">{friend.display_name}</p>
                    <p className="text-sm text-white/60 truncate">@{friend.username}</p>
                  </div>
                </div>
                <Button
                  onClick={() => toggleCloseFriend(friend.id)}
                  variant={friend.isCloseFriend ? 'default' : 'outline'}
                  size="sm"
                  className={
                    friend.isCloseFriend
                      ? 'bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90'
                      : 'border-[#a855f7] text-white hover:bg-[#a855f7]/10'
                  }
                >
                  {friend.isCloseFriend ? (
                    <>
                      <Heart className="w-4 h-4 mr-1 fill-current" />
                      Close Friend
                    </>
                  ) : (
                    <>
                      <Heart className="w-4 h-4 mr-1" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
