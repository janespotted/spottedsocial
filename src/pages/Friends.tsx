import { useState, useEffect, useCallback } from 'react';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Copy, Users, Search, UserPlus, QrCode, Check, Loader2, Clock, ChevronRight, ChevronDown, MessageCircle, Link2, X, Heart, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { triggerPushNotification } from '@/lib/push-notifications';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import { QRCodeModal } from '@/components/QRCodeModal';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { MyFriendsTab } from '@/components/MyFriendsTab';

interface SearchResult {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

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

interface SuggestedFriend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  mutual_count: number;
}

type FriendshipStatus = 'none' | 'pending' | 'accepted';

export default function Friends() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  
  const initialTab = (location.state as any)?.tab === 'invite' ? 'invite' : 'friends';
  const [activeTab, setActiveTab] = useState<'friends' | 'invite'>(initialTab);
  
  // Friend requests state
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(false);
  
  // Invite link state
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [usesCount, setUsesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, FriendshipStatus>>({});
  const [ralliedIds, setRalliedIds] = useState<Set<string>>(new Set());

  // Get current user's display name for rally message
  const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
  const currentUserProfile = allProfiles.find((p: any) => p.id === user?.id);

  const handleRally = useCallback(async (friendId: string) => {
    if (!user || ralliedIds.has(friendId)) return;
    // Skip DB notification for demo users
    const targetProfile = allProfiles.find((p: any) => p.id === friendId);
    if (targetProfile?.is_demo) {
      setRalliedIds(prev => new Set(prev).add(friendId));
      toast.success('Rally sent! 📣');
      return;
    }
    const senderName = currentUserProfile?.display_name || 'Someone';
    try {
      const message = `${senderName} wants you to rally. Come out tonight! 👋`;
      const { data: notifData, error } = await supabase.rpc('create_notification', {
        p_receiver_id: friendId,
        p_type: 'rally',
        p_message: message,
      });
      if (error) throw error;
      
      // Trigger push notification
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
  
  // QR modal state
  const [showQRModal, setShowQRModal] = useState(false);
  
  // Copy animation state
  const [justCopied, setJustCopied] = useState(false);
  
  // People you may know state
  const [suggestedFriends, setSuggestedFriends] = useState<SuggestedFriend[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  useEffect(() => {
    if (user) {
      fetchOrCreateInviteCode();
      fetchSuggestedFriends();
      fetchRequests();
    }
  }, [user]);

  // Auto-refresh on tab/app return
  useVisibilityRefresh(() => {
    if (user) {
      fetchRequests();
      fetchSuggestedFriends();
    }
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetchRequests();
        fetchSuggestedFriends();
        queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
        queryClient.invalidateQueries({ queryKey: ['profiles-safe'] });
      }, 1500);
    };
    const channel = supabase
      .channel('friends-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchUsers();
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchOrCreateInviteCode = async () => {
    try {
      const { data: existingCode } = await supabase
        .from('invite_codes')
        .select('code, uses_count')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCode) {
        setInviteCode(existingCode.code);
        setUsesCount(existingCode.uses_count ?? 0);
        setLoading(false);
        return;
      }

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let newCode = '';
      for (let i = 0; i < 8; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const { data, error } = await supabase
        .from('invite_codes')
        .insert({ user_id: user?.id, code: newCode })
        .select('code, uses_count')
        .single();

      if (!error && data) {
        setInviteCode(data.code);
        setUsesCount(data.uses_count ?? 0);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching invite code:', error);
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const { data: friendRequests } = await supabase
        .from('friendships')
        .select('id, user_id')
        .eq('friend_id', user?.id)
        .eq('status', 'pending');

      if (!friendRequests || friendRequests.length === 0) {
        setRequests([]);
        setLoadingRequests(false);
        return;
      }

      const requestsWithMutuals = await Promise.all(
        friendRequests.map(async (req) => {
          const { data: profiles } = await supabase
            .from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', req.user_id);
          const profile = profiles?.[0];

          if (!profile) return null;
          if (!demoEnabled && profile.is_demo) return null;

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

      // Fetch outgoing pending requests
      const { data: outgoing } = await supabase
        .from('friendships')
        .select('id, friend_id')
        .eq('user_id', user?.id)
        .eq('status', 'pending');

      if (outgoing && outgoing.length > 0) {
        const outgoingWithProfiles = await Promise.all(
          outgoing.map(async (req) => {
            const { data: profiles } = await supabase
              .from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', req.friend_id);
            const profile = profiles?.[0];
            if (!profile) return null;
            if (!demoEnabled && profile.is_demo) return null;
            return {
              id: req.id,
              user_id: req.friend_id,
              display_name: profile.display_name,
              username: profile.username,
              avatar_url: profile.avatar_url,
              mutual_friends: [],
            };
          })
        );
        setOutgoingRequests(outgoingWithProfiles.filter(r => r !== null) as FriendRequest[]);
      } else {
        setOutgoingRequests([]);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const getMutualFriends = async (userId: string) => {
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

    const mutualIds = myFriendIds.filter(id => theirFriendIds.includes(id));
    if (mutualIds.length === 0) return [];

    const { data: allProfiles } = await supabase.rpc('get_profiles_safe');
    const mutualProfiles = (allProfiles || [])
      .filter((p: any) => mutualIds.includes(p.id))
      .slice(0, 5);

    return mutualProfiles || [];
  };

  const acceptRequest = async (requestId: string) => {
    const request = requests.find(r => r.id === requestId);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to accept request');
      return;
    }

    // Trigger push notification for acceptance
    if (request && user) {
      const myName = currentUserProfile?.display_name || 'Someone';
      triggerPushNotification({
        id: `friend-accept-${requestId}`,
        receiver_id: request.user_id,
        sender_id: user.id,
        type: 'friend_accepted',
        message: `${myName} accepted your friend request!`,
      });
    }

    haptic.success();
    toast.success('Friend request accepted!');
    setRequests(requests.filter(r => r.id !== requestId));
    queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
    queryClient.invalidateQueries({ queryKey: ['profiles-safe'] });
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

    haptic.light();
    setRequests(requests.filter(r => r.id !== requestId));
  };

  const cancelOutgoingRequest = async (requestId: string) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to cancel request');
      return;
    }

    haptic.light();
    toast.success('Friend request cancelled');
    setOutgoingRequests(outgoingRequests.filter(r => r.id !== requestId));
  };

  const getMutualText = (mutuals: any[]) => {
    if (mutuals.length === 0) return '';
    if (mutuals.length === 1) return `Friends with ${mutuals[0].display_name}`;
    const first = mutuals[0].display_name.split(' ')[0];
    const rest = mutuals.length - 1;
    return `Friends with ${first} and ${rest} other${rest > 1 ? 's' : ''}`;
  };

  const fetchSuggestedFriends = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSuggestions(true);

    try {
      const { data, error } = await supabase.rpc('get_people_you_may_know' as any, {
        p_user_id: user.id,
        p_limit: 10,
      });

      if (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestedFriends([]);
        return;
      }

      const suggestions: SuggestedFriend[] = (data || []).map((r: any) => ({
        id: r.user_id,
        display_name: r.display_name,
        username: r.username,
        avatar_url: r.avatar_url,
        mutual_count: Number(r.mutual_count),
      }));

      setSuggestedFriends(suggestions);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [user?.id]);

  const getInviteUrl = () => `${APP_BASE_URL}/invite/${inviteCode}`;

  const handleTextFriend = () => {
    const message = encodeURIComponent(
      `Hey! Join me on Spotted to see where friends are going out tonight 🎉 ${getInviteUrl()}`
    );
    haptic.light();
    window.location.href = `sms:?&body=${message}`;
  };

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(getInviteUrl());
      haptic.light();
      setJustCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setJustCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const searchUsers = async () => {
    setSearching(true);
    try {
      const { data } = await supabase.rpc('get_profiles_safe');
      
      if (data) {
        const filtered = data.filter((profile: any) => 
          profile.id !== user?.id &&
          (!demoEnabled ? !profile.is_demo : true) &&
          (profile.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           profile.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
        ).slice(0, 10);
        
        setSearchResults(filtered);
        
        if (filtered.length > 0) {
          await fetchFriendshipStatuses(filtered.map((p: SearchResult) => p.id));
        }
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const fetchFriendshipStatuses = async (userIds: string[]) => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      const statuses: Record<string, FriendshipStatus> = {};
      
      userIds.forEach(id => {
        const friendship = data?.find(
          f => (f.user_id === user.id && f.friend_id === id) ||
               (f.user_id === id && f.friend_id === user.id)
        );
        
        if (friendship) {
          statuses[id] = friendship.status as FriendshipStatus;
        } else {
          statuses[id] = 'none';
        }
      });
      
      setFriendshipStatuses(statuses);
    } catch (error) {
      console.error('Error fetching friendship statuses:', error);
    }
  };

  const sendFriendRequest = async (friendId: string) => {
    try {
      const currentStatus = friendshipStatuses[friendId];
      
      if (currentStatus === 'accepted') {
        toast.info('Already friends!');
        return;
      }
      
      if (currentStatus === 'pending') {
        toast.info('Request already pending');
        return;
      }

      const { error } = await supabase
        .from('friendships')
        .insert({ user_id: user?.id, friend_id: friendId, status: 'pending' });

      if (error) throw error;

      // Create notification via RPC and trigger push
      const senderName = currentUserProfile?.display_name || 'Someone';
      supabase.rpc('create_notification', {
        p_receiver_id: friendId,
        p_type: 'friend_request',
        p_message: `${senderName} sent you a friend request`,
      }).then(({ data }) => {
        const notif = Array.isArray(data) ? data[0] : data;
        if (notif?.id) {
          triggerPushNotification({
            id: notif.id,
            receiver_id: friendId,
            sender_id: user!.id,
            type: 'friend_request',
            message: `${senderName} sent you a friend request`,
          });
        }
      });

      setFriendshipStatuses(prev => ({ ...prev, [friendId]: 'pending' }));

      // Add to outgoing requests list immediately
      const friendProfile = searchResults.find(r => r.id === friendId)
        || suggestedFriends.find(r => r.id === friendId);
      if (friendProfile) {
        setOutgoingRequests(prev => [...prev, {
          id: `temp-${friendId}`,
          user_id: friendId,
          display_name: friendProfile.display_name,
          username: friendProfile.username,
          avatar_url: friendProfile.avatar_url,
          mutual_friends: [],
        }]);
      }

      haptic.success();
      toast.success('Friend request sent!');
    } catch (error) {
      toast.error('Failed to send request');
    }
  };

  const getButtonState = (userId: string) => {
    const status = friendshipStatuses[userId];
    
    if (status === 'accepted') {
      return { label: 'Friends', icon: Check, disabled: true, variant: 'outline' as const };
    }
    if (status === 'pending') {
      return { label: 'Pending', icon: Clock, disabled: true, variant: 'outline' as const };
    }
    return { label: 'Add', icon: UserPlus, disabled: false, variant: 'default' as const };
  };

  const pendingCount = requests.length;

  const handleRefresh = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
    queryClient.invalidateQueries({ queryKey: ['profiles-safe'] });
    await Promise.all([fetchRequests(), fetchOrCreateInviteCode(), fetchSuggestedFriends()]);
  }, [queryClient, fetchRequests, fetchOrCreateInviteCode, fetchSuggestedFriends]);

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="min-h-screen bg-gradient-to-b from-[#1a0f2e] to-[#110a24]">
      <div className="max-w-[430px] mx-auto pb-24">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-[#110a24] pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between px-4 h-12">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-white/70 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold text-white">Friends</h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowQRModal(true)} className="text-white/50 hover:text-white transition-colors">
                <QrCode className="h-5 w-5" />
              </button>
              <button onClick={openCheckIn} className="hover:scale-105 transition-transform">
                <img src={spottedLogo} alt="Go live" className="h-8 w-8 object-contain" />
              </button>
            </div>
          </div>
        </header>

        <div className="px-4 pt-3 pb-4 space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or username"
              className="bg-white/5 border-white/8 text-white placeholder:text-white/25 rounded-2xl pl-10 h-11 text-sm focus:border-white/20"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-white/30 hover:text-white/50" />
              </button>
            )}
          </div>

          {/* Search Results */}
          {isSearching && (
            <div>
              {searching ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-white/10 border-t-[#d4ff00] rounded-full animate-spin" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((result) => {
                    const status = friendshipStatuses[result.id];
                    return (
                      <div key={result.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors">
                        <button onClick={() => openFriendCard({ userId: result.id, displayName: result.display_name, avatarUrl: result.avatar_url })}>
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={result.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#1a0a2e] text-white">{result.display_name?.[0] || '?'}</AvatarFallback>
                          </Avatar>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-[15px] truncate">{result.display_name}</p>
                          <p className="text-white/40 text-xs truncate">@{result.username}</p>
                        </div>
                        {status === 'accepted' ? (
                          ralliedIds.has(result.id) ? (
                            <span className="text-[#d4ff00]/50 text-xs font-medium">Sent</span>
                          ) : (
                            <button onClick={() => handleRally(result.id)} className="h-8 px-4 text-xs font-medium border border-white/15 text-white rounded-full hover:bg-white/5 transition-colors">
                              Rally
                            </button>
                          )
                        ) : status === 'pending' ? (
                          <span className="text-white/40 text-xs font-medium">Pending</span>
                        ) : (
                          <button onClick={() => sendFriendRequest(result.id)} className="h-8 px-4 text-xs font-semibold bg-[#d4ff00] text-black rounded-full hover:bg-[#d4ff00]/90 transition-colors">
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/40 text-sm mb-3">No one found</p>
                  <button onClick={handleTextFriend} className="text-sm font-medium text-[#d4ff00] hover:text-[#d4ff00]/80 transition-colors">
                    Invite via text instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Default Content (not searching) */}
          {!isSearching && (
            <>
              {/* Friend Requests */}
              {pendingCount > 0 && (
                <section>
                  <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-3">
                    Requests · {pendingCount}
                  </h2>
                  <div className="space-y-1">
                    {requests.map((request) => (
                      <div key={request.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03]">
                        <button onClick={() => openFriendCard({ userId: request.user_id, displayName: request.display_name, avatarUrl: request.avatar_url })}>
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={request.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#1a0a2e] text-white">{request.display_name[0]}</AvatarFallback>
                          </Avatar>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-[15px] truncate">{request.display_name}</p>
                          {request.mutual_friends.length > 0 && (
                            <p className="text-white/35 text-xs truncate">{getMutualText(request.mutual_friends)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => acceptRequest(request.id)} className="h-8 px-4 text-xs font-semibold bg-[#d4ff00] text-black rounded-full hover:bg-[#d4ff00]/90 transition-colors">
                            Accept
                          </button>
                          <button onClick={() => declineRequest(request.id)} className="h-8 w-8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Suggested */}
              {suggestedFriends.length > 0 && (
                <section>
                  <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-3">Suggested</h2>
                  <div className="space-y-1">
                    {suggestedFriends.map((friend) => {
                      const status = friendshipStatuses[friend.id];
                      return (
                        <div key={friend.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#1a0a2e] text-white">{friend.display_name?.[0] || '?'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-[15px] truncate">{friend.display_name}</p>
                            <p className="text-white/35 text-xs">
                              {friend.mutual_count} mutual{friend.mutual_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                          {status === 'pending' ? (
                            <span className="text-white/40 text-xs font-medium">Pending</span>
                          ) : status === 'accepted' ? (
                            <span className="text-white/30 text-xs">Friends</span>
                          ) : (
                            <button onClick={() => sendFriendRequest(friend.id)} className="h-8 px-4 text-xs font-semibold bg-[#d4ff00] text-black rounded-full hover:bg-[#d4ff00]/90 transition-colors">
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* My Friends */}
              <MyFriendsTab />

              {/* Invite Section */}
              <section>
                <h2 className="text-xs text-white/40 uppercase tracking-[0.15em] font-semibold mb-3">Invite friends</h2>
                <div className="space-y-2">
                  <button
                    onClick={handleTextFriend}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#d4ff00]/10 flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-[#d4ff00]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white text-sm font-medium">Text a friend</p>
                      <p className="text-white/30 text-xs">Send your invite link via iMessage</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20" />
                  </button>

                  <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                      {justCopied ? <Check className="h-5 w-5 text-[#22c55e]" /> : <Copy className="h-5 w-5 text-white/50" />}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white text-sm font-medium">{justCopied ? 'Link copied' : 'Copy invite link'}</p>
                      <p className="text-white/30 text-xs">Share anywhere</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20" />
                  </button>
                </div>

                {usesCount > 0 && (
                  <p className="text-white/25 text-xs text-center mt-3">
                    {usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <QRCodeModal open={showQRModal} onOpenChange={setShowQRModal} inviteUrl={getInviteUrl()} />
    </div>
    </PullToRefresh>
  );
}
