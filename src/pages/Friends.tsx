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
            .rpc('get_profile_safe', { target_user_id: req.user_id });
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
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
      <div className="max-w-[430px] mx-auto pb-24">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-[#2d1b4e]/80 backdrop-blur-lg border-b border-white/10 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/profile')}
                className="p-2 -ml-2 text-white/80 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold text-white">Friends</h1>
            </div>
            <button 
              onClick={openCheckIn}
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Go live" className="h-10 w-10 object-contain" />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => {
          const tab = v as 'friends' | 'invite';
          setActiveTab(tab);
          if (tab === 'friends') {
            queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
            queryClient.invalidateQueries({ queryKey: ['profiles-safe'] });
          }
        }} className="w-full">
          <div className="px-4 pt-4">
            <TabsList className="w-full bg-[#1a0f2e]/80 border border-[#a855f7]/30 p-1 rounded-2xl flex justify-center">
              <TabsTrigger 
                value="friends" 
                className="flex-1 rounded-xl data-[state=active]:bg-[#d4ff00] data-[state=active]:text-[#0a0118] data-[state=active]:font-bold text-white/60"
              >
                Friends
                {pendingCount > 0 && (
                  <Badge className="ml-2 bg-[#a855f7] text-white text-xs px-1.5 py-0">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="invite" 
                className="flex-1 rounded-xl data-[state=active]:bg-[#d4ff00] data-[state=active]:text-[#0a0118] data-[state=active]:font-bold text-white/60"
              >
                Invite
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Friends Tab */}
          <TabsContent value="friends" className="px-4 py-4 space-y-3">
            {/* Search bar + Close Friends link */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or username..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl pl-10 h-10 text-sm"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <X className="h-3.5 w-3.5 text-white/30 hover:text-white/50" />
                  </button>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => navigate('/profile/close-friends')}
                  className="flex items-center gap-1 text-[#a855f7] text-xs hover:text-[#a855f7]/80 transition-colors"
                >
                  <Heart className="h-3 w-3" />
                  Manage Close Friends
                </button>
              </div>
            </div>

            {/* Search results (when searching) */}
            {isSearching && (
              <div className="space-y-3">
                {searching && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 text-[#a855f7] animate-spin" />
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl overflow-hidden">
                    {searchResults.map((result) => {
                      const buttonState = getButtonState(result.id);
                      const ButtonIcon = buttonState.icon;
                      
                      return (
                        <div
                          key={result.id}
                          className="flex items-center gap-3 p-3 border-b border-[#a855f7]/10 last:border-b-0"
                        >
                          <Avatar className="h-11 w-11 border-2 border-[#a855f7]/40">
                            <AvatarImage src={result.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
                              {result.display_name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm truncate">{result.display_name}</p>
                            <p className="text-white/40 text-xs truncate">@{result.username}</p>
                          </div>
                          {friendshipStatuses[result.id] === 'accepted' ? (
                            ralliedIds.has(result.id) ? (
                              <span className="flex items-center gap-1 text-[#d4ff00]/60 text-xs font-medium px-2">
                                <Check className="h-3.5 w-3.5" />
                                Rallied
                              </span>
                            ) : (
                              <Button
                                onClick={() => handleRally(result.id)}
                                size="sm"
                                className="bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] text-white rounded-xl text-xs"
                              >
                                <Megaphone className="h-3.5 w-3.5 mr-1" />
                                Rally
                              </Button>
                            )
                          ) : (
                            <Button
                              onClick={() => sendFriendRequest(result.id)}
                              size="sm"
                              disabled={buttonState.disabled}
                              variant={buttonState.variant}
                              className={buttonState.disabled 
                                ? "border-[#a855f7]/40 text-white/60 rounded-xl text-xs"
                                : "bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] text-white rounded-xl text-xs"
                              }
                            >
                              <ButtonIcon className="h-3.5 w-3.5 mr-1" />
                              {buttonState.label}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                  <p className="text-white/50 text-sm text-center py-4">
                    No users found. Invite them with your link!
                  </p>
                )}
              </div>
            )}

            {/* Non-search content */}
            {!isSearching && (
              <>
                {/* Pending requests banner */}
                {!loadingRequests && pendingCount > 0 && (
                  <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setRequestsExpanded(!requestsExpanded)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-[#a855f7]/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                          <UserPlus className="h-4 w-4 text-[#a855f7]" />
                        </div>
                        <span className="text-white text-sm font-medium">
                          You have {pendingCount} friend request{pendingCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {requestsExpanded ? (
                        <ChevronDown className="h-4 w-4 text-white/40" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/40" />
                      )}
                    </button>

                    {requestsExpanded && (
                      <div className="border-t border-[#a855f7]/10">
                        {requests.map((request) => (
                          <div
                            key={request.id}
                            className="flex items-center gap-3 p-3.5 border-b border-[#a855f7]/10 last:border-b-0"
                          >
                            <button
                              onClick={() => openFriendCard({
                                userId: request.user_id,
                                displayName: request.display_name,
                                avatarUrl: request.avatar_url,
                              })}
                              className="transition-transform hover:scale-110"
                            >
                              <Avatar className="h-11 w-11 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                                <AvatarImage src={request.avatar_url || undefined} />
                                <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
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
                                <h3 className="font-semibold text-white text-sm">{request.display_name}</h3>
                              </button>
                              {request.mutual_friends.length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <div className="flex -space-x-2">
                                    {request.mutual_friends.slice(0, 2).map((friend, idx) => (
                                      <Avatar key={idx} className="h-4 w-4 border border-[#1a0f2e]">
                                        <AvatarImage src={friend.avatar_url || undefined} />
                                        <AvatarFallback className="bg-[#2d1b4e] text-white text-[8px]">
                                          {friend.display_name[0]}
                                        </AvatarFallback>
                                      </Avatar>
                                    ))}
                                  </div>
                                  <p className="text-white/50 text-xs ml-0.5">
                                    {getMutualText(request.mutual_friends)}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button
                                onClick={() => acceptRequest(request.id)}
                                variant="outline"
                                size="sm"
                                className="border-[#a855f7] text-white hover:bg-[#a855f7]/20 rounded-full px-3 text-xs"
                              >
                                Confirm
                              </Button>
                              <button
                                onClick={() => declineRequest(request.id)}
                                className="text-white/60 hover:text-white transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Friend list (MyFriendsTab content) */}
                <MyFriendsTab />

                {/* People You May Know */}
                {(loadingSuggestions || suggestedFriends.length > 0) && (
                  <div className="space-y-3 pt-2">
                    <h3 className="font-semibold text-white text-sm px-1">People You May Know</h3>
                    
                    {loadingSuggestions ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 text-[#a855f7] animate-spin" />
                      </div>
                    ) : (
                      <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl overflow-hidden">
                        {suggestedFriends.map((friend, index) => {
                          const buttonState = getButtonState(friend.id);
                          const ButtonIcon = buttonState.icon;
                          
                          return (
                            <div
                              key={friend.id}
                              className={`flex items-center gap-3 p-3 ${
                                index !== suggestedFriends.length - 1 ? 'border-b border-[#a855f7]/10' : ''
                              }`}
                            >
                              <Avatar className="h-11 w-11 border-2 border-[#a855f7]/40">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
                                  {friend.display_name?.[0] || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-white text-sm truncate">{friend.display_name}</p>
                                <p className="text-white/40 text-xs flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {friend.mutual_count} mutual friend{friend.mutual_count !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <Button
                                onClick={() => sendFriendRequest(friend.id)}
                                size="sm"
                                disabled={buttonState.disabled}
                                variant={buttonState.variant}
                                className={buttonState.disabled 
                                  ? "border-[#a855f7]/40 text-white/60 rounded-xl text-xs"
                                  : "bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] text-white rounded-xl text-xs"
                                }
                              >
                                <ButtonIcon className="h-3.5 w-3.5 mr-1" />
                                {buttonState.label}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Invite Tab */}
          <TabsContent value="invite" className="px-4 py-4 space-y-5">
            {/* Invite Friends Section */}
            <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center">
                  <Link2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">Invite Friends</h3>
                  <p className="text-white/50 text-sm">Share your link to grow your squad</p>
                </div>
              </div>

              {loading ? (
                <div className="h-24 bg-[#0a0118]/50 rounded-2xl animate-pulse" />
              ) : (
                <div className="space-y-3">
                  <Button
                    onClick={handleTextFriend}
                    className="w-full bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] text-white font-semibold py-6 rounded-2xl"
                  >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Text a Friend
                  </Button>
                  <Button
                    onClick={handleCopyLink}
                    variant="outline"
                    className="w-full border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20 py-6 rounded-2xl"
                  >
                    {justCopied ? (
                      <Check className="h-5 w-5 mr-2 text-green-400" />
                    ) : (
                      <Copy className="h-5 w-5 mr-2" />
                    )}
                    {justCopied ? 'Copied!' : 'Copy Invite Link'}
                  </Button>

                  {usesCount > 0 && (
                    <div className="flex items-center justify-center gap-2 text-[#a855f7] text-sm pt-2">
                      <Users className="h-4 w-4" />
                      <span>{usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Show My QR Code Button */}
            <button
              onClick={() => setShowQRModal(true)}
              className="w-full bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 flex items-center gap-4 hover:bg-[#a855f7]/10 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center">
                <QrCode className="h-6 w-6 text-white" />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-semibold text-white">Show My QR Code</h3>
                <p className="text-white/50 text-sm">For adding friends in person</p>
              </div>
              <ChevronRight className="h-5 w-5 text-white/40" />
            </button>
          </TabsContent>
        </Tabs>
      </div>

      {/* QR Code Modal */}
      <QRCodeModal
        open={showQRModal}
        onOpenChange={setShowQRModal}
        inviteUrl={getInviteUrl()}
      />
    </div>
    </PullToRefresh>
  );
}
