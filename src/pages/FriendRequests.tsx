import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Search, X, UserPlus, Heart } from 'lucide-react';
import { toast } from 'sonner';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface FriendRequest {
  id: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  mutual_friends: Array<{
    display_name: string;
    avatar_url: string | null;
  }>;
}

interface SuggestedUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  mutual_friends: Array<{
    display_name: string;
    avatar_url: string | null;
  }>;
}

export default function FriendRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchSuggested();
    }
  }, [user]);

  const fetchRequests = async () => {
    const { data: friendRequests } = await supabase
      .from('friendships')
      .select(`
        id,
        user_id
      `)
      .eq('friend_id', user?.id)
      .eq('status', 'pending');

    if (!friendRequests) return;

    const requestsWithMutuals = await Promise.all(
      friendRequests.map(async (req) => {
        // Get the user's profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .eq('id', req.user_id)
          .single();

        if (!profile) return null;

        const mutualFriends = await getMutualFriends(req.user_id);
        return {
          id: req.id,
          user_id: req.user_id,
          display_name: profile.display_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          mutual_friends: mutualFriends,
        };
      })
    );

    setRequests(requestsWithMutuals.filter(r => r !== null) as FriendRequest[]);
  };

  const fetchSuggested = async () => {
    // Get ALL existing friendships (any status - pending, accepted, blocked)
    const { data: sentFriendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id);

    const { data: receivedFriendships } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('friend_id', user?.id);

    const friendIds = [
      ...(sentFriendships?.map(f => f.friend_id) || []),
      ...(receivedFriendships?.map(f => f.user_id) || [])
    ];

    // Get all users except me and my friends
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .neq('id', user?.id)
      .not('id', 'in', `(${friendIds.join(',') || 'null'})`);

    if (!allUsers) return;

    const suggestedWithMutuals = await Promise.all(
      allUsers.slice(0, 10).map(async (profile) => {
        const mutualFriends = await getMutualFriends(profile.id);
        return {
          ...profile,
          mutual_friends: mutualFriends,
        };
      })
    );

    setSuggested(suggestedWithMutuals);
  };

  const getMutualFriends = async (userId: string) => {
    // Get my friends (both directions)
    const { data: mySentFriendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const { data: myReceivedFriendships } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('friend_id', user?.id)
      .eq('status', 'accepted');

    const myFriendIds = [
      ...(mySentFriendships?.map(f => f.friend_id) || []),
      ...(myReceivedFriendships?.map(f => f.user_id) || [])
    ];

    if (myFriendIds.length === 0) return [];

    // Get their friends (both directions)
    const { data: theirSentFriendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('status', 'accepted');

    const { data: theirReceivedFriendships } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('friend_id', userId)
      .eq('status', 'accepted');

    const theirFriendIds = [
      ...(theirSentFriendships?.map(f => f.friend_id) || []),
      ...(theirReceivedFriendships?.map(f => f.user_id) || [])
    ];

    // Find intersection
    const mutualIds = myFriendIds.filter(id => theirFriendIds.includes(id));

    if (mutualIds.length === 0) return [];

    // Get profiles
    const { data: mutualProfiles } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .in('id', mutualIds)
      .limit(5);

    return mutualProfiles || [];
  };

  const acceptRequest = async (requestId: string) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to accept request');
      return;
    }

    toast.success('Friend request accepted!');
    setRequests(requests.filter(r => r.id !== requestId));
  };

  const declineRequest = async (requestId: string) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to decline request');
      return;
    }

    setRequests(requests.filter(r => r.id !== requestId));
  };

  const sendFriendRequest = async (friendId: string) => {
    const { error } = await supabase
      .from('friendships')
      .insert({
        user_id: user!.id,
        friend_id: friendId,
        status: 'pending',
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('You already sent a request to this person');
      } else {
        toast.error('Failed to send request');
      }
      return;
    }

    toast.success('Friend request sent!');
    setSuggested(suggested.filter(s => s.id !== friendId));
  };

  const dismissSuggestion = (userId: string) => {
    setSuggested(suggested.filter(s => s.id !== userId));
  };

  const getMutualText = (mutuals: any[]) => {
    if (mutuals.length === 0) return '';
    if (mutuals.length === 1) return `Friends with ${mutuals[0].display_name}`;
    
    const first = mutuals[0].display_name.split(' ')[0];
    const rest = mutuals.length - 1;
    return `Friends with ${first} and ${rest} other${rest > 1 ? 's' : ''}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <div className="max-w-[430px] mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <button 
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/profile');
              }
            }}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="flex-1 text-center">
            <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
          </div>

          <button 
            onClick={openCheckIn}
            className="hover:scale-110 transition-transform"
          >
            <img src={spottedLogo} alt="Check In" className="h-12 w-12 object-contain" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        <h2 className="text-2xl font-bold text-white text-center">Friend Requests</h2>

        {/* Manage Close Friends Button */}
        <button
          onClick={() => navigate('/profile/close-friends')}
          className="w-full flex items-center justify-center gap-2 bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4 text-white hover:bg-[#a855f7]/20 transition-colors"
        >
          <Heart className="h-5 w-5 text-[#d4ff00]" />
          <span>Manage Close Friends</span>
        </button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full pl-12"
          />
        </div>

        {/* Friend Requests */}
        {requests.length > 0 && (
          <div className="space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openFriendCard({
                      userId: request.user_id,
                      displayName: request.display_name,
                      avatarUrl: request.avatar_url,
                    })}
                    className="transition-transform hover:scale-110"
                  >
                    <Avatar className="h-14 w-14 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                      <AvatarImage src={request.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {request.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                  </button>

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => openFriendCard({
                        userId: request.user_id,
                        displayName: request.display_name,
                        avatarUrl: request.avatar_url,
                      })}
                      className="text-left hover:opacity-80 transition-opacity"
                    >
                      <h3 className="font-semibold text-white">{request.display_name}</h3>
                    </button>
                    {request.mutual_friends.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <div className="flex -space-x-2">
                          {request.mutual_friends.slice(0, 2).map((friend, idx) => (
                            <Avatar key={idx} className="h-5 w-5 border border-[#1a0f2e]">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        <p className="text-white/60 text-xs ml-1">
                          {getMutualText(request.mutual_friends)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => acceptRequest(request.id)}
                      variant="outline"
                      className="border-[#a855f7] text-white hover:bg-[#a855f7]/20 rounded-full px-4"
                    >
                      Confirm
                    </Button>
                    <button
                      onClick={() => declineRequest(request.id)}
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggested */}
        {suggested.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Suggested for you</h3>
            <div className="space-y-3">
              {suggested.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openFriendCard({
                        userId: user.id,
                        displayName: user.display_name,
                        avatarUrl: user.avatar_url,
                      })}
                      className="transition-transform hover:scale-110"
                    >
                      <Avatar className="h-14 w-14 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white">
                          {user.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    </button>

                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => openFriendCard({
                          userId: user.id,
                          displayName: user.display_name,
                          avatarUrl: user.avatar_url,
                        })}
                        className="text-left hover:opacity-80 transition-opacity"
                      >
                        <h3 className="font-semibold text-white">{user.display_name}</h3>
                      </button>
                      {user.mutual_friends.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="flex -space-x-2">
                            {user.mutual_friends.slice(0, 2).map((friend, idx) => (
                              <Avatar key={idx} className="h-5 w-5 border border-[#1a0f2e]">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                  {friend.display_name[0]}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <p className="text-white/60 text-xs ml-1">
                            {getMutualText(user.mutual_friends)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => sendFriendRequest(user.id)}
                        className="text-[#d4ff00] hover:scale-110 transition-transform"
                      >
                        <UserPlus className="h-6 w-6" />
                      </button>
                      <button
                        onClick={() => dismissSuggestion(user.id)}
                        className="text-white/60 hover:text-white transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {requests.length === 0 && suggested.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/60">No friend requests</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
