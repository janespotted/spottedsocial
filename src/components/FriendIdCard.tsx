import { useEffect, useState, useRef } from 'react';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, ChevronRight, ChevronDown, CalendarPlus, Share2, Megaphone, UserPlus, Check, EyeOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MessageSquare, MoreVertical, Flag, Ban, X as CloseIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/contexts/AuthContext';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { invalidateFriendGraph } from '@/lib/invalidate-friend-graph';
import { useMutualFriendsWith } from '@/hooks/useMutualFriendsWith';
import { ReportDialog } from '@/components/ReportDialog';
import { isFromTonight } from '@/lib/time-context';
import { toast } from 'sonner';
import { CreatePlanDialog } from '@/components/CreatePlanDialog';
import { getOrCreateInviteCode, getInviteLink, triggerSmsInvite } from '@/lib/sms-invite';
import { triggerPushNotification } from '@/lib/push-notifications';
import { haptic } from '@/lib/haptics';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FriendData {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  last_known_lat: number | null;
  last_known_lng: number | null;
}

interface NightStatus {
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
}

interface FriendsAtVenue {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface UserStatus {
  isOut: boolean;
  currentVenue: string | null;
  lastUpdatedAt: string | null;
  lastEndedAt: string | null;
  lat: number | null;
  lng: number | null;
  canSeeLocation: boolean;
  isPrivateParty: boolean;
}

export function FriendIdCard() {
  const { selectedFriend, closeFriendCard, openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const { sendMeetUpNotification } = useMeetUp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const demoEnabled = useDemoMode();
  const queryClient = useQueryClient();
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendsAtVenue[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [statusSubtitle, setStatusSubtitle] = useState<string>('');
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');
  const [friendRing, setFriendRing] = useState<'close' | 'direct' | 'mutual' | null>(null);
  const [venueCoords, setVenueCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showCreatePlanDialog, setShowCreatePlanDialog] = useState(false);
  const [rallySent, setRallySent] = useState(false);
  const [preselectedFriendForPlan, setPreselectedFriendForPlan] = useState<{
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null>(null);
  const [badgeConfirm, setBadgeConfirm] = useState<'add_close' | 'remove_close' | 'send_request' | null>(null);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [statusPopoverView, setStatusPopoverView] = useState<'menu' | 'confirm'>('menu');
  const [removingFriend, setRemovingFriend] = useState(false);
  const removeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [friendRequestState, setFriendRequestState] = useState<'idle' | 'requested' | 'sending'>('idle');
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLocationHidden, setIsLocationHidden] = useState(false);
  const [overflowView, setOverflowView] = useState<'menu' | 'block-confirm'>('menu');
  const [blockingUser, setBlockingUser] = useState(false);
  const blockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Friends shared with this person — only fetched for non-friends (mutual ring)
  const { data: mutualFriends = [] } = useMutualFriendsWith(
    friendRing === 'mutual' ? selectedFriend?.userId : undefined
  );

  useEffect(() => {
    if (selectedFriend && user) {
      console.log('Friend ID Card opened for:', selectedFriend);
      // Use passed relationshipType as initial hint, then verify from DB
      if (selectedFriend.relationshipType) {
        setFriendRing(selectedFriend.relationshipType);
      }
      // Always verify relationship from DB (corrects stale/wrong hints)
      (async () => {
        const uid = user.id;
        const fid = selectedFriend.userId;
        // Check if direct friend
        const { data: friendship } = await supabase
          .from('friendships')
          .select('id')
          .or(`and(user_id.eq.${uid},friend_id.eq.${fid}),and(user_id.eq.${fid},friend_id.eq.${uid})`)
          .eq('status', 'accepted')
          .maybeSingle();
        if (friendship) {
          // Check if I consider them a close friend (one-directional)
          const { data: close } = await supabase
            .from('close_friends')
            .select('id')
            .eq('user_id', uid)
            .eq('close_friend_id', fid)
            .maybeSingle();
          setFriendRing(close ? 'close' : 'direct');
        } else {
          // Only show "Mutual Friend" if we actually share a common friend
          const { data: isMutual } = await supabase.rpc('is_mutual_friend', {
            viewer_id: uid,
            target_user_id: fid,
          });
          setFriendRing(isMutual ? 'mutual' : null);
        }
      })();
      // Fetch hide state
      (async () => {
        const { data } = await supabase
          .from('location_hidden')
          .select('id')
          .eq('user_id', user.id)
          .eq('hidden_from_id', selectedFriend.userId)
          .maybeSingle();
        setIsLocationHidden(!!data);
      })();
      // Check if this is a demo user
      checkIfDemoUser();
      // Fetch venue coordinates for distance calculation
      // Fetch venue coordinates for distance calculation
      if (selectedFriend.venueName) {
        fetchVenueCoordinates(selectedFriend.venueName);
      }
      if (demoEnabled) {
        // In demo mode, use the provided venue directly
        setStatusSubtitle(selectedFriend.venueName || '');
        fetchUserLocation();
        fetchFriendsAtVenue();
      } else {
        // In production, fetch real status
        fetchUserStatus();
        fetchUserLocation();
      }
    } else {
      setFriendsAtVenue([]);
      setDistance(null);
      setUserStatus(null);
      setStatusSubtitle('');
      setIsDemoUser(false);
      setFriendRing(null);
      setStatusPopoverOpen(false);
      setStatusPopoverView('menu');
      setRemovingFriend(false);
      setFriendRequestState('idle');
      setIsLocationHidden(false);
      setOverflowView('menu');
      setBlockingUser(false);
      setVenueCoords(null);
      setShowCreatePlanDialog(false);
      setRallySent(false);
    }
  }, [selectedFriend, demoEnabled]);

  const fetchVenueCoordinates = async (venueName: string) => {
    const { data } = await supabase
      .from('venues')
      .select('lat, lng')
      .eq('name', venueName)
      .maybeSingle();
    
    if (data?.lat && data?.lng) {
      setVenueCoords({ lat: data.lat, lng: data.lng });
    }
  };

  const checkIfDemoUser = async () => {
    if (!selectedFriend) return;
    // Use safe RPC to check if user is demo (respects location privacy)
    const { data } = await supabase.from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', selectedFriend.userId);
    setIsDemoUser(data?.[0]?.is_demo || false);
    setFriendUsername(data?.[0]?.username || '');
  };

  // Calculate distance when we have both locations
  useEffect(() => {
    // Get friend's coordinates from multiple sources (with fallback to venue coords)
    const friendLat = selectedFriend?.lat || userStatus?.lat || venueCoords?.lat;
    const friendLng = selectedFriend?.lng || userStatus?.lng || venueCoords?.lng;

    if (userLocation && friendLat && friendLng) {
      const dist = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        friendLat,
        friendLng
      );
      setDistance(dist);
    } else {
      setDistance(null);
    }
  }, [selectedFriend, userLocation, userStatus, venueCoords]);

  const fetchUserStatus = async () => {
    if (!selectedFriend || !user) return;

    try {
      // Check if viewer can see this user's location
      const { data: canSeeData } = await supabase.rpc('can_see_location', {
        viewer_id: user.id,
        target_user_id: selectedFriend.userId
      });

      const canSeeLocation = canSeeData || false;

      // Fetch night status and active check-in in parallel
      const [nightStatusRes, activeCheckInRes] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('status, planning_neighborhood, venue_name, is_private_party, party_neighborhood, updated_at, lat, lng')
          .eq('user_id', selectedFriend.userId)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
        supabase
          .from('checkins')
          .select('venue_name, lat, lng, last_updated_at, started_at')
          .eq('user_id', selectedFriend.userId)
          .is('ended_at', null)
          .gt('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const nightStatus = nightStatusRes.data;
      // Only treat checkin as active if it's from tonight's window (resets at 5am)
      const activeCheckIn = activeCheckInRes.data && isFromTonight(activeCheckInRes.data.started_at)
        ? activeCheckInRes.data
        : null;

      // Compare timestamps to determine which is more recent
      const checkinTime = activeCheckIn?.started_at ? new Date(activeCheckIn.started_at).getTime() : 0;
      const nightTime = nightStatus?.updated_at ? new Date(nightStatus.updated_at).getTime() : 0;

      // Planning status always takes priority
      if (nightStatus?.status === 'planning') {
        setUserStatus({
          isOut: false,
          currentVenue: null,
          lastUpdatedAt: null,
          lastEndedAt: null,
          lat: null,
          lng: null,
          canSeeLocation: true,
          isPrivateParty: false
        });
        const neighborhoodText = nightStatus.planning_neighborhood 
          ? `TBD tonight — thinking: ${nightStatus.planning_neighborhood}`
          : 'TBD tonight';
        setStatusSubtitle(neighborhoodText);
        return;
      }

      // Night status 'out' is more recent than checkin — use it
      if (nightStatus?.status === 'out' && nightTime >= checkinTime && canSeeLocation) {
        if (nightStatus.is_private_party) {
          const neighborhood = nightStatus.party_neighborhood;
          setUserStatus({
            isOut: true,
            currentVenue: 'Private Party',
            lastUpdatedAt: nightStatus.updated_at,
            lastEndedAt: null,
            lat: nightStatus.lat,
            lng: nightStatus.lng,
            canSeeLocation: true,
            isPrivateParty: true
          });
          const ppMinsAgo = Math.floor((Date.now() - new Date(nightStatus.updated_at).getTime()) / 60000);
          const ppTimeAgo = ppMinsAgo < 1 ? 'just now' : ppMinsAgo < 60 ? `${ppMinsAgo} min ago` : `${Math.floor(ppMinsAgo / 60)} hr ago`;
          setStatusSubtitle(neighborhood ? `@ Private Party · ${neighborhood} • ${ppTimeAgo}` : `@ Private Party • ${ppTimeAgo}`);
        } else {
          const venueName = nightStatus.venue_name || null;
          const nsMinsAgo = Math.floor((Date.now() - new Date(nightStatus.updated_at).getTime()) / 60000);
          const nsTimeAgo = nsMinsAgo < 1 ? 'just now' : nsMinsAgo < 60 ? `${nsMinsAgo} min ago` : `${Math.floor(nsMinsAgo / 60)} hr ago`;
          setUserStatus({
            isOut: true,
            currentVenue: venueName || 'Out',
            lastUpdatedAt: nightStatus.updated_at,
            lastEndedAt: null,
            lat: nightStatus.lat,
            lng: nightStatus.lng,
            canSeeLocation: true,
            isPrivateParty: false
          });
          setStatusSubtitle(venueName ? `@ ${venueName} • ${nsTimeAgo}` : `Out now • ${nsTimeAgo}`);
          if (venueName) fetchFriendsAtVenue(venueName);
        }
        return;
      }

      // Active check-in is more recent
      if (activeCheckIn && canSeeLocation) {
        const lastUpdated = new Date(activeCheckIn.last_updated_at);
        const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
        
        setUserStatus({
          isOut: true,
          currentVenue: activeCheckIn.venue_name,
          lastUpdatedAt: activeCheckIn.last_updated_at,
          lastEndedAt: null,
          lat: activeCheckIn.lat,
          lng: activeCheckIn.lng,
          canSeeLocation: true,
          isPrivateParty: false
        });

        const timeAgo = minutesAgo < 1 ? 'just now' : 
                       minutesAgo < 60 ? `${minutesAgo} min ago` : 
                       `${Math.floor(minutesAgo / 60)} hr ago`;
        
        setStatusSubtitle(`@ ${activeCheckIn.venue_name} • ${timeAgo}`);
        fetchFriendsAtVenue(activeCheckIn.venue_name);
      } else if (!canSeeLocation) {
        // Location sharing is OFF or viewer doesn't have permission
        setUserStatus({
          isOut: false,
          currentVenue: null,
          lastUpdatedAt: null,
          lastEndedAt: null,
          lat: null,
          lng: null,
          canSeeLocation: false,
          isPrivateParty: false
        });
        setStatusSubtitle('Home');
      } else {
        // User is no longer out - fetch their last ended check-in
        const { data: lastCheckIn } = await supabase
          .from('checkins')
          .select('venue_name, ended_at')
          .eq('user_id', selectedFriend.userId)
          .not('ended_at', 'is', null)
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCheckIn && canSeeLocation && isFromTonight(lastCheckIn.ended_at)) {
          const hoursAgo = Math.floor((Date.now() - new Date(lastCheckIn.ended_at).getTime()) / 3600000);
          
          setUserStatus({
            isOut: false,
            currentVenue: null,
            lastUpdatedAt: null,
            lastEndedAt: lastCheckIn.ended_at,
            lat: null,
            lng: null,
            canSeeLocation: true,
            isPrivateParty: false
          });

          const timeAgo = hoursAgo < 1 ? 'less than an hour ago' : 
                         hoursAgo === 1 ? '1 hour ago' : 
                         `${hoursAgo} hours ago`;
          
          setStatusSubtitle(`In for the night • Last at ${lastCheckIn.venue_name} ${timeAgo}`);
        } else {
          setUserStatus({
            isOut: false,
            currentVenue: null,
            lastUpdatedAt: null,
            lastEndedAt: null,
            lat: null,
            lng: null,
            canSeeLocation: true,
            isPrivateParty: false
          });
          setStatusSubtitle('In for the night');
        }
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
      setStatusSubtitle('Status unavailable');
    }
  };

  const fetchUserLocation = async () => {
    if (!user) return;
    
    const { data: profileRows } = await supabase
      .from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', user.id);
    const data = profileRows?.[0] ?? null;

    if (data && data.last_known_lat && data.last_known_lng) {
      setUserLocation({ lat: data.last_known_lat, lng: data.last_known_lng });
    }
  };

  const fetchFriendsAtVenue = async (venueName?: string) => {
    const venue = venueName || selectedFriend?.venueName;
    if (!venue || !user) return;

    // Fetch other friends at the same venue (both directions)
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

    // Find active check-ins at this venue
    const [checkInsResult, profilesResult] = await Promise.all([
      supabase
        .from('checkins')
        .select('user_id')
        .eq('venue_name', venue)
        .neq('user_id', selectedFriend.userId)
        .in('user_id', friendIds)
        .is('ended_at', null),
      supabase.rpc('get_profiles_safe'),
    ]);

    const activeCheckIns = checkInsResult.data;
    if (activeCheckIns && activeCheckIns.length > 0) {
      const checkinProfileMap = new Map(
        (profilesResult.data || []).map((p: any) => [p.id, p])
      );

      const friends = activeCheckIns.map(c => {
        const prof = checkinProfileMap.get(c.user_id);
        return {
          user_id: c.user_id,
          display_name: prof?.display_name || 'Friend',
          avatar_url: prof?.avatar_url || null,
        };
      });
      setFriendsAtVenue(friends);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleBadgeConfirm = async () => {
    if (!selectedFriend || !user) return;

    try {
      if (badgeConfirm === 'remove_close') {
        await supabase
          .from('close_friends')
          .delete()
          .eq('user_id', user.id)
          .eq('close_friend_id', selectedFriend.userId);
        haptic.success();
        toast.success('Removed from close friends');
        // Update the card's relationship display
        closeFriendCard();
      } else if (badgeConfirm === 'add_close') {
        await supabase
          .from('close_friends')
          .insert({ user_id: user.id, close_friend_id: selectedFriend.userId });
        haptic.success();
        toast.success('Added to close friends 💛');
        closeFriendCard();
      } else if (badgeConfirm === 'send_request') {
        // Check if request already exists
        const { data: existing } = await supabase
          .from('friendships')
          .select('status')
          .or(`and(user_id.eq.${user.id},friend_id.eq.${selectedFriend.userId}),and(user_id.eq.${selectedFriend.userId},friend_id.eq.${user.id})`)
          .limit(1)
          .maybeSingle();

        if (existing?.status === 'accepted') {
          toast.info('Already friends!');
        } else if (existing?.status === 'pending') {
          toast.info('Request already pending');
        } else {
          const { error: insertErr } = await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: selectedFriend.userId, status: 'pending' });

          if (insertErr) throw insertErr;

          // Send notification (skip for demo users — not in auth.users)
          const cachedProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
          const targetIsDemo = cachedProfiles.find((p: any) => p.id === selectedFriend.userId)?.is_demo;
          if (!targetIsDemo) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', user.id)
              .single();
            const senderName = profile?.display_name || 'Someone';
            const message = `${senderName} sent you a friend request`;

            supabase.rpc('create_notification', {
              p_receiver_id: selectedFriend.userId,
              p_type: 'friend_request',
              p_message: message,
            }).then(({ data }) => {
              const notif = Array.isArray(data) ? data[0] : data;
              if (notif?.id) {
                triggerPushNotification({
                  id: notif.id,
                  receiver_id: selectedFriend!.userId,
                  sender_id: user!.id,
                  type: 'friend_request',
                  message,
                });
              }
            });
          }

          haptic.success();
          toast.success('Friend request sent!');
        }
        closeFriendCard();
      }
    } catch (error) {
      console.error('Badge action failed:', error);
      toast.error('Something went wrong');
    } finally {
      setBadgeConfirm(null);
    }
  };

  // ── Friend Status Popover handlers ──
  const handleToggleStatus = async (targetRing: 'close' | 'direct') => {
    if (!selectedFriend || !user || targetRing === friendRing) return;

    const prevRing = friendRing;
    setFriendRing(targetRing);
    setStatusPopoverOpen(false);
    haptic.light();

    if (targetRing === 'close') {
      const { error } = await supabase
        .from('close_friends')
        .insert({ user_id: user.id, close_friend_id: selectedFriend.userId });
      if (error) {
        setFriendRing(prevRing);
        toast.error('Failed to update friend status');
        return;
      }
      toast.success(`${selectedFriend.displayName.split(' ')[0]} added to Close Friends`);
    } else {
      const { error } = await supabase
        .from('close_friends')
        .delete()
        .eq('user_id', user.id)
        .eq('close_friend_id', selectedFriend.userId);
      if (error) {
        setFriendRing(prevRing);
        toast.error('Failed to update friend status');
        return;
      }
      toast.success(`${selectedFriend.displayName.split(' ')[0]} moved to Friends`);
    }
  };

  // ── Remove friend: immediate write, undo restores ──
  const handleRemoveFriend = async () => {
    if (!selectedFriend || !user || removingFriend) return;
    setRemovingFriend(true);

    const friendId = selectedFriend.userId;
    const friendName = selectedFriend.displayName;
    const prevRing = friendRing;

    // Capture friendship row before deleting so undo can restore it
    const { data: friendshipRows } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .eq('status', 'accepted');

    // Delete close friend entry
    const { error: cfErr } = await supabase
      .from('close_friends')
      .delete()
      .eq('user_id', user.id)
      .eq('close_friend_id', friendId);

    // Delete friendship (both directions)
    const { error: fErr } = await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

    if (cfErr || fErr) {
      toast.error('Failed to remove friend');
      setRemovingFriend(false);
      return;
    }

    setStatusPopoverOpen(false);
    closeFriendCard();
    invalidateFriendGraph(queryClient);

    toast(`Removed ${friendName} as a friend`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          // Restore friendship row(s)
          let restoreFailed = false;
          if (friendshipRows && friendshipRows.length > 0) {
            for (const row of friendshipRows) {
              const { id, created_at, ...insertData } = row;
              const { error } = await supabase.from('friendships').insert(insertData);
              if (error) { restoreFailed = true; break; }
            }
          }
          if (restoreFailed) {
            toast.error(`Failed to restore ${friendName}`);
            return;
          }
          // Restore close friend if was close
          if (prevRing === 'close') {
            const { error } = await supabase
              .from('close_friends')
              .insert({ user_id: user.id, close_friend_id: friendId });
            if (error) console.error('Failed to restore close friend:', error);
          }
          queryClient.invalidateQueries({ queryKey: ['friends-out-status'] });
          toast.success(`${friendName} restored`);
          setRemovingFriend(false);
        },
      },
      duration: 6000,
      onAutoClose: () => setRemovingFriend(false),
      onDismiss: () => setRemovingFriend(false),
    });
  };

  // ── Mutual friend request: immediate write, undo cancels ──
  const handleSendFriendRequest = async () => {
    if (!selectedFriend || !user || friendRequestState !== 'idle') return;

    setFriendRequestState('sending');
    haptic.light();

    const friendId = selectedFriend.userId;
    const friendName = selectedFriend.displayName.split(' ')[0];

    // Check if request already exists
    const { data: existing } = await supabase
      .from('friendships')
      .select('status')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .limit(1)
      .maybeSingle();

    if (existing?.status === 'accepted') {
      toast.info('Already friends!');
      setFriendRequestState('requested');
      return;
    }
    if (existing?.status === 'pending') {
      toast.info('Request already pending');
      setFriendRequestState('requested');
      return;
    }

    const { error } = await supabase
      .from('friendships')
      .insert({ user_id: user.id, friend_id: friendId, status: 'pending' });

    if (error) {
      setFriendRequestState('idle');
      toast.error('Failed to send friend request');
      return;
    }

    setFriendRequestState('requested');

    // Send notification (skip demo users)
    const cachedProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
    const targetIsDemo = cachedProfiles.find((p: any) => p.id === friendId)?.is_demo;
    if (!targetIsDemo) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      const senderName = profile?.display_name || 'Someone';
      const message = `${senderName} sent you a friend request`;

      supabase.rpc('create_notification', {
        p_receiver_id: friendId,
        p_type: 'friend_request',
        p_message: message,
      }).then(({ data }) => {
        const notif = Array.isArray(data) ? data[0] : data;
        if (notif?.id) {
          triggerPushNotification({
            id: notif.id,
            receiver_id: friendId,
            sender_id: user!.id,
            type: 'friend_request',
            message,
          });
        }
      });
    }

    toast(`Friend request sent to ${friendName}`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          const { error: delErr } = await supabase
            .from('friendships')
            .delete()
            .eq('user_id', user.id)
            .eq('friend_id', friendId)
            .eq('status', 'pending');
          if (!delErr) setFriendRequestState('idle');
        },
      },
      duration: 6000,
    });
  };

  const handleCancelFriendRequest = async () => {
    if (!selectedFriend || !user) return;

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_id', user.id)
      .eq('friend_id', selectedFriend.userId)
      .eq('status', 'pending');

    if (error) {
      toast.error('Failed to cancel request');
      return;
    }
    setFriendRequestState('idle');
    toast.success('Friend request cancelled');
  };

  // ── Hide My Location toggle ──
  const handleToggleHide = async () => {
    if (!selectedFriend || !user) return;
    const wasHidden = isLocationHidden;
    setIsLocationHidden(!wasHidden);
    haptic.light();

    if (wasHidden) {
      const { error } = await supabase
        .from('location_hidden')
        .delete()
        .eq('user_id', user.id)
        .eq('hidden_from_id', selectedFriend.userId);
      if (error) {
        setIsLocationHidden(wasHidden);
        toast.error('Failed to update location privacy');
        return;
      }
      toast.success(`${selectedFriend.displayName.split(' ')[0]} can see your location again`);
    } else {
      const { error } = await supabase
        .from('location_hidden')
        .insert({ user_id: user.id, hidden_from_id: selectedFriend.userId });
      if (error) {
        setIsLocationHidden(wasHidden);
        toast.error('Failed to update location privacy');
        return;
      }
      toast.success(`${selectedFriend.displayName.split(' ')[0]} can no longer see your location`);
    }
  };

  // ── Block: immediate write, undo reverses ──
  const handleBlockWithUndo = async () => {
    if (!selectedFriend || !user || blockingUser) return;
    setBlockingUser(true);

    const blockedId = selectedFriend.userId;
    const blockedName = selectedFriend.displayName;
    const prevRing = friendRing;

    // Capture friendship state before deleting so undo can restore
    const { data: friendshipRows } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${user.id})`)
      .eq('status', 'accepted');

    // 1. Insert block
    const { error: blockErr } = await supabase
      .from('blocked_users')
      .insert({ blocker_id: user.id, blocked_id: blockedId });

    if (blockErr) {
      if (blockErr.code === '23505') {
        toast.info('User already blocked');
      } else {
        toast.error('Failed to block user');
      }
      setBlockingUser(false);
      return;
    }

    // 2. Sever friendship
    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${user.id})`);

    // 3. Remove close friend entries
    await supabase
      .from('close_friends')
      .delete()
      .or(`and(user_id.eq.${user.id},close_friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},close_friend_id.eq.${user.id})`);

    setOverflowView('menu');
    closeFriendCard();
    invalidateFriendGraph(queryClient);

    toast(`${blockedName} blocked`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          // Remove the block
          const { error: unblockErr } = await supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', blockedId);
          if (unblockErr) {
            toast.error('Failed to undo block');
            return;
          }
          // Restore friendship
          if (friendshipRows && friendshipRows.length > 0) {
            for (const row of friendshipRows) {
              const { id, created_at, ...insertData } = row;
              await supabase.from('friendships').insert(insertData);
            }
          }
          // Restore close friend if was close
          if (prevRing === 'close') {
            await supabase
              .from('close_friends')
              .insert({ user_id: user.id, close_friend_id: blockedId });
          }
          queryClient.invalidateQueries({ queryKey: ['friends-out-status'] });
          toast.success(`${blockedName} unblocked`);
          setBlockingUser(false);
        },
      },
      duration: 6000,
      onAutoClose: () => setBlockingUser(false),
      onDismiss: () => setBlockingUser(false),
    });
  };

  // Clean up on unmount (only requestTimeoutRef still deferred — remove/block are now immediate)
  useEffect(() => {
    return () => {
      if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current);
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
      if (blockTimeoutRef.current) clearTimeout(blockTimeoutRef.current);
    };
  }, []);

  const handleOpenDM = () => {
    if (!selectedFriend) return;

    closeFriendCard();
    navigate('/messages', { 
      state: { 
        preselectedUser: {
          id: selectedFriend.userId,
          display_name: selectedFriend.displayName,
          avatar_url: selectedFriend.avatarUrl
        }
      } 
    });
  };

  const handleMeetUp = async () => {
    if (!selectedFriend || !user) return;

    // If demo user (not a real Spotted user), prompt SMS invite instead
    if (isDemoUser && !demoEnabled) {
      haptic.light();
      try {
        const { data: profile } = await supabase
          .from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', user.id);
        const senderName = profile?.[0]?.display_name?.split(' ')[0] || 'Your friend';
        const code = await getOrCreateInviteCode(user.id);
        const venueName = userStatus?.currentVenue || selectedFriend.venueName || undefined;
        const link = getInviteLink(code);
        await triggerSmsInvite({
          senderName,
          venueName,
          inviteLink: link,
          contactName: selectedFriend.displayName,
        });
      } catch (err) {
        console.error('SMS invite error:', err);
        toast.error('Could not open share sheet');
      }
      closeFriendCard();
      return;
    }

    await sendMeetUpNotification(
      selectedFriend.userId,
      selectedFriend.displayName,
      selectedFriend.avatarUrl
    );
    closeFriendCard();
  };

  const handleInviteViaSms = async () => {
    if (!selectedFriend || !user) return;
    haptic.light();
    try {
      const { data: profile } = await supabase
        .from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', user.id);
      const senderName = profile?.[0]?.display_name?.split(' ')[0] || 'Your friend';
      const code = await getOrCreateInviteCode(user.id);
      const venueName = userStatus?.currentVenue || selectedFriend.venueName || undefined;
      const link = getInviteLink(code);
      await triggerSmsInvite({
        senderName,
        venueName,
        inviteLink: link,
        contactName: selectedFriend.displayName,
      });
    } catch (err) {
      console.error('SMS invite error:', err);
      toast.error('Could not open share sheet');
    }
  };

  const handleMakePlans = () => {
    if (!selectedFriend) return;

    const friendData = {
      id: selectedFriend.userId,
      display_name: selectedFriend.displayName,
      avatar_url: selectedFriend.avatarUrl,
    };

    closeFriendCard();
    // Navigate to plans section with friend preselected
    // Use timeout to avoid the useEffect race that clears the dialog
    setTimeout(() => {
      navigate('/', { state: { feedMode: 'plans', preselectedFriend: friendData } });
    }, 100);
  };

  const handleRally = async () => {
    if (!user || !selectedFriend || rallySent) return;
    try {
      const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
      const myProfile = allProfiles.find((p: any) => p.id === user.id);
      const targetProfile = allProfiles.find((p: any) => p.id === selectedFriend.userId);
      const senderName = myProfile?.display_name || 'Someone';
      const message = `${senderName} wants you to rally. Come out tonight! 👋`;

      // Demo users aren't in auth.users — skip DB insert, just show confirmation
      if (targetProfile?.is_demo) {
        setRallySent(true);
        haptic.success();
        toast.success('Rally sent! 📣');
        return;
      }

      const { data: notifData, error } = await supabase.rpc('create_notification', {
        p_receiver_id: selectedFriend.userId,
        p_type: 'rally',
        p_message: message,
      });
      if (error) throw error;

      const notif = Array.isArray(notifData) ? notifData[0] : notifData;
      if (notif) {
        triggerPushNotification({
          id: notif.id,
          receiver_id: selectedFriend.userId,
          sender_id: user.id,
          type: 'rally',
          message,
        });
      }

      setRallySent(true);
      haptic.success();
      toast.success('Rally sent! 📣');
    } catch (err) {
      console.error('Rally failed:', err);
      toast.error('Could not send rally');
    }
  };

  // Check if it's Wed-Sun (rally nights)
  const isRallyNight = (() => {
    const day = new Date().getDay();
    return day >= 3 || day === 0; // Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
  })();

  const handlePlanCreated = () => {
    setShowCreatePlanDialog(false);
    setPreselectedFriendForPlan(null);
  };

  const handleVenueClick = async (venueName: string) => {
    closeFriendCard();
    
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();
      
    if (data?.id) {
      openVenueCard(data.id);
    }
  };

  const handlePrivatePartyClick = () => {
    closeFriendCard();
    navigate('/map', {
      state: {
        flyTo: {
          lat: userStatus?.lat,
          lng: userStatus?.lng,
          zoom: 15,
        }
      }
    });
  };

  const handleNameClick = () => {
    if (!userStatus?.lat || !userStatus?.lng) return;
    closeFriendCard();
    navigate('/map', {
      state: {
        flyTo: {
          lat: userStatus.lat,
          lng: userStatus.lng,
          zoom: 15,
        }
      }
    });
  };

  const handleBlockUser = async () => {
    if (!selectedFriend || !user) return;

    try {
      const { error } = await supabase
        .from('blocked_users')
        .insert({
          blocker_id: user.id,
          blocked_id: selectedFriend.userId,
        });

      if (error) {
        if (error.code === '23505') {
          toast.info('User already blocked');
        } else {
          throw error;
        }
      } else {
        toast.success(`Blocked ${selectedFriend.displayName}`);
      }
      closeFriendCard();
    } catch (error: any) {
      console.error('Error blocking user:', error);
      toast.error('Failed to block user');
    }
  };

  const isOutStatus = userStatus?.isOut || (demoEnabled && !!selectedFriend?.venueName);

  const swipeHandlers = useSwipeGesture({
    onSwipeDown: closeFriendCard,
    threshold: 50
  });

  return (
    <>
      {selectedFriend && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[300] bg-black/80 animate-in fade-in-0"
            onClick={closeFriendCard}
          />
      {/* Mobile frame constrained container */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-full z-[300] flex items-center justify-center px-4 pointer-events-none">
              {/* Card */}
              <div
                className="relative w-full max-w-[390px] bg-[#1a1030] border border-[#a855f7]/30 rounded-3xl p-0 overflow-hidden pointer-events-auto animate-card-lift shadow-[0_0_40px_rgba(168,85,247,0.15)]"
                {...swipeHandlers}
              >
                {/* Three-dot menu — top right — privacy controls */}
                <Popover onOpenChange={(open) => { if (!open) setOverflowView('menu'); }}>
                  <PopoverTrigger className="absolute right-4 top-4 z-20 w-7 h-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors" aria-haspopup="menu">
                    <MoreVertical className="h-4 w-4 text-white/50" />
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    sideOffset={4}
                    className="w-64 p-0 bg-[#1a0f2e] border border-[#a855f7]/30 rounded-xl z-[350]"
                  >
                    {overflowView === 'menu' ? (
                      <div>
                        {/* Privacy section */}
                        <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium px-3 pt-2.5 pb-1">
                          Privacy
                        </p>

                        {/* Hide My Location toggle */}
                        {(friendRing === 'close' || friendRing === 'direct' || friendRing === 'mutual') && (
                          <div className="px-3 py-2">
                            <button
                              onClick={handleToggleHide}
                              className="w-full flex items-center gap-2.5"
                              role="menuitemcheckbox"
                              aria-checked={isLocationHidden}
                            >
                              <EyeOff className="h-4 w-4 text-white/50 flex-shrink-0" />
                              <span className="text-white text-sm flex-1 text-left">
                                {isLocationHidden ? 'Location Hidden' : 'Hide My Location'}
                              </span>
                              {/* Toggle switch */}
                              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                                isLocationHidden ? 'bg-amber-500' : 'bg-white/15'
                              }`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                  isLocationHidden ? 'translate-x-4' : 'translate-x-0'
                                }`} />
                              </div>
                            </button>
                            <p className="text-white/30 text-[11px] leading-snug mt-1.5 ml-[26px]">
                              {selectedFriend?.displayName.split(' ')[0]} stays your friend and won't be notified — they just won't see you on the map.
                            </p>
                          </div>
                        )}

                        <div className="border-t border-white/[0.08] mx-2 my-1" />

                        {/* Block */}
                        <button
                          onClick={() => setOverflowView('block-confirm')}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Ban className="h-4 w-4" />
                          <span className="text-sm">Block {selectedFriend?.displayName.split(' ')[0]}…</span>
                        </button>

                        <div className="border-t border-white/[0.08] mx-2 my-1" />

                        {/* Report — kept from original menu */}
                        <button
                          onClick={() => setShowReportDialog(true)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-white/70 hover:bg-white/5 transition-colors"
                        >
                          <Flag className="h-4 w-4" />
                          <span className="text-sm">Report User</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3">
                        <p className="text-white text-sm font-medium mb-1">
                          Block {selectedFriend?.displayName}?
                        </p>
                        <p className="text-white/40 text-xs mb-3 leading-relaxed">
                          They won't see you on the map, message you, or send you requests. They won't be notified.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setOverflowView('menu')}
                            className="flex-1 h-8 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/15 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleBlockWithUndo}
                            disabled={blockingUser}
                            className="flex-1 h-8 rounded-lg bg-red-500/80 text-white text-xs font-medium hover:bg-red-500 disabled:opacity-40 transition-colors"
                          >
                            Block
                          </button>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

              <div className="pt-5 pb-6" style={{ paddingLeft: 20, paddingRight: 20 }}>
                {/* Avatar + Info row */}
                <div className="flex items-center gap-4 mb-4">
                  {/* Avatar with gradient ring */}
                  <div className="relative flex-shrink-0">
                    <div className={`rounded-full p-[3px] ${
                      selectedFriend.relationshipType === 'close'
                        ? 'bg-gradient-to-br from-[#a855f7] to-[#d4ff00]'
                        : selectedFriend.relationshipType === 'mutual'
                        ? 'bg-gradient-to-br from-[#a855f7] to-[#6366f1]'
                        : 'bg-gradient-to-br from-[#a855f7] to-[#a855f7]/60'
                    }`}>
                      <Avatar className="h-16 w-16 border-2 border-[#1a1030]">
                        <AvatarImage src={selectedFriend.avatarUrl || undefined} />
                        <AvatarFallback className="bg-[#1a1030] text-white text-xl">
                          {selectedFriend.displayName[0]}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  {/* Name + venue/status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      {userStatus?.lat && userStatus?.lng ? (
                        <button
                          onClick={handleNameClick}
                          className="text-xl font-bold text-white leading-tight hover:underline cursor-pointer text-left truncate"
                        >
                          {selectedFriend.displayName}
                        </button>
                      ) : (
                        <h2 className="text-xl font-bold text-white leading-tight truncate">
                          {selectedFriend.displayName}
                        </h2>
                      )}
                    </div>
                    {demoEnabled && selectedFriend.venueName ? (
                      <button
                        onClick={() => handleVenueClick(selectedFriend.venueName!)}
                        className="text-[#d4ff00] text-sm font-medium leading-tight hover:underline text-left truncate block"
                      >
                        @{selectedFriend.venueName}
                      </button>
                    ) : userStatus?.isOut && userStatus.currentVenue ? (
                      <button
                        onClick={() => userStatus.isPrivateParty ? handlePrivatePartyClick() : handleVenueClick(userStatus.currentVenue!)}
                        className="text-[#d4ff00] text-sm font-medium leading-tight hover:underline text-left truncate block"
                      >
                        {statusSubtitle}
                      </button>
                    ) : friendUsername ? (
                      <p className="text-white/40 text-sm leading-tight truncate">@{friendUsername}</p>
                    ) : statusSubtitle ? (
                      <p className="text-white/40 text-sm leading-tight truncate">{statusSubtitle}</p>
                    ) : null}
                    {friendRing && friendRing !== 'mutual' ? (
                      <Popover
                        open={statusPopoverOpen}
                        onOpenChange={(open) => {
                          setStatusPopoverOpen(open);
                          if (!open) setStatusPopoverView('menu');
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase transition-colors hover:opacity-80 ${
                              friendRing === 'close'
                                ? 'bg-[#d4ff00]/15 text-[#d4ff00]'
                                : 'bg-[#9333ea]/15 text-[#c084fc]'
                            }`}
                            aria-haspopup="menu"
                            aria-expanded={statusPopoverOpen}
                          >
                            {friendRing === 'close' ? 'Close Friend' : 'Friend'}
                            <ChevronDown className={`w-3 h-3 transition-transform ${statusPopoverOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-0 bg-[#1a0f2e] border border-[#a855f7]/30 rounded-xl z-[350]"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                        >
                          {statusPopoverView === 'menu' ? (
                            <div role="menu">
                              <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium px-3 pt-2.5 pb-1.5">
                                Friend Status
                              </p>
                              <button
                                role="menuitem"
                                onClick={() => handleToggleStatus('close')}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors"
                              >
                                <div className="w-2.5 h-2.5 rounded-full bg-[#d4ff00]" />
                                <span className="text-white text-sm flex-1 text-left">Close Friend</span>
                                {friendRing === 'close' && <Check className="w-4 h-4 text-[#d4ff00]" />}
                              </button>
                              <button
                                role="menuitem"
                                onClick={() => handleToggleStatus('direct')}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors"
                              >
                                <div className="w-2.5 h-2.5 rounded-full bg-[#9333ea]" />
                                <span className="text-white text-sm flex-1 text-left">Friend</span>
                                {friendRing === 'direct' && <Check className="w-4 h-4 text-[#9333ea]" />}
                              </button>
                              <div className="border-t border-white/[0.08] mx-2 my-1" />
                              <button
                                role="menuitem"
                                onClick={() => setStatusPopoverView('confirm')}
                                className="w-full text-left px-3 py-2.5 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
                              >
                                Remove Friend…
                              </button>
                            </div>
                          ) : (
                            <div className="p-3">
                              <p className="text-white text-sm font-medium mb-1">
                                Remove {selectedFriend?.displayName}?
                              </p>
                              <p className="text-white/40 text-xs mb-3 leading-relaxed">
                                They won't be notified, but you'll no longer see each other on the map.
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setStatusPopoverView('menu')}
                                  className="flex-1 h-8 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/15 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleRemoveFriend}
                                  disabled={removingFriend}
                                  className="flex-1 h-8 rounded-lg bg-red-500/80 text-white text-xs font-medium hover:bg-red-500 disabled:opacity-40 transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    ) : friendRing === 'mutual' ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-[#6366f1]/15 text-[#818cf8] transition-colors hover:opacity-80"
                            aria-haspopup="menu"
                          >
                            Mutual Friend
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl z-[350]"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                        >
                          <p className="text-white/60 text-xs px-2 mb-2">
                            Mutual friends
                          </p>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {/* Include the card person themselves */}
                            <button
                              className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/[0.04]"
                              disabled
                            >
                              <Avatar className="h-8 w-8 border border-[#a855f7]/40">
                                <AvatarImage src={selectedFriend.avatarUrl || undefined} />
                                <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                  {selectedFriend.displayName[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-white text-sm font-medium flex-1 text-left truncate">
                                {selectedFriend.displayName}
                              </span>
                            </button>
                            {mutualFriends.map((mutual) => (
                              <button
                                key={mutual.user_id}
                                onClick={() => {
                                  closeFriendCard();
                                  setTimeout(() => {
                                    openFriendCard({
                                      userId: mutual.user_id,
                                      displayName: mutual.display_name,
                                      avatarUrl: mutual.avatar_url,
                                      relationshipType: 'direct',
                                    });
                                  }, 100);
                                }}
                                className="w-full flex items-center gap-2 p-2 rounded-lg pressable-row"
                              >
                                <Avatar className="h-8 w-8 border border-[#a855f7]/40">
                                  <AvatarImage src={mutual.avatar_url || undefined} />
                                  <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                    {mutual.display_name[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-white text-sm font-medium flex-1 text-left truncate">
                                  {mutual.display_name}
                                </span>
                                <ChevronRight className="h-4 w-4 text-white/40" />
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isLocationHidden && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-400" aria-label={`${selectedFriend?.displayName} can't see your location`}>
                          <EyeOff className="w-2.5 h-2.5" />
                          Hidden
                        </span>
                      )}
                      {distance !== null && isOutStatus && (
                        <p className="text-white/30 text-xs leading-tight">
                          {distance.toFixed(1)} mi away
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons — single row, uniform 14px gap */}
                <div className="flex items-center" style={{ gap: 8 }}>
              {/* Friends at Venue - Tappable with Popover */}
                {friendsAtVenue.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                        <div className="flex -space-x-2">
                          {friendsAtVenue.slice(0, 2).map((friend) => (
                            <Avatar key={friend.user_id} className="h-7 w-7 border-2 border-[#1a0f2e]">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {friendsAtVenue.length > 2 && (
                          <span className="text-white text-sm font-medium">+{friendsAtVenue.length - 2}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent 
                      className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl z-[350]"
                      align="start"
                      side="top"
                    >
                      <p className="text-white/60 text-xs px-2 mb-2">
                        Also here tonight
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {friendsAtVenue.map((friend) => (
                          <button
                            key={friend.user_id}
                            onClick={() => {
                              closeFriendCard();
                              setTimeout(() => {
                                openFriendCard({
                                  userId: friend.user_id,
                                  displayName: friend.display_name,
                                  avatarUrl: friend.avatar_url,
                                  venueName: selectedFriend?.venueName || userStatus?.currentVenue,
                                });
                              }, 100);
                            }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg pressable-row"
                          >
                            <Avatar className="h-8 w-8 border border-[#a855f7]/40">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-white text-sm font-medium flex-1 text-left">
                              {friend.display_name}
                            </span>
                            <ChevronRight className="h-4 w-4 text-white/40" />
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Action Buttons - Context-aware based on friend's status */}
                {(!isDemoUser || demoEnabled) && (
                  <>
                    {/* Add Friend / Requested — flex:none, hugs content */}
                    {friendRing === 'mutual' && (
                      friendRequestState === 'idle' ? (
                        <button
                          onClick={handleSendFriendRequest}
                          className="flex-none inline-flex items-center gap-1 h-[42px] rounded-full border border-[#a855f7]/40 text-[#a855f7] text-[11px] font-medium hover:bg-[#a855f7]/10 transition-colors"
                          style={{ paddingLeft: 14, paddingRight: 14 }}
                          aria-live="polite"
                        >
                          <UserPlus className="h-4 w-4" />
                          Add Friend
                        </button>
                      ) : (
                        <button
                          onClick={handleCancelFriendRequest}
                          disabled={friendRequestState === 'sending'}
                          className="flex-none inline-flex items-center gap-1 h-[42px] rounded-full border border-white/15 text-white/40 text-[11px] font-medium whitespace-nowrap hover:bg-white/5 disabled:opacity-40 transition-colors"
                          style={{ paddingLeft: 14, paddingRight: 14 }}
                          aria-live="polite"
                        >
                          <Check className="h-4 w-4" />
                          Requested
                        </button>
                      )
                    )}
                    {/* Meet Up / Make Plans — flex:1, takes remaining width */}
                    {isOutStatus ? (
                      <button
                        onClick={handleMeetUp}
                        className="flex-1 inline-flex items-center justify-center gap-2 h-[42px] px-5 rounded-full bg-[#d4ff00] text-black text-sm font-bold whitespace-nowrap hover:bg-[#d4ff00]/90 transition-colors shadow-[0_0_16px_rgba(212,255,0,0.25)]"
                      >
                        <UserPlus className="h-4 w-4" />
                        Meet Up
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleMakePlans}
                          className="flex-1 inline-flex items-center justify-center gap-2 h-[42px] px-5 rounded-full border border-[#a855f7]/40 text-[#a855f7] text-sm font-bold whitespace-nowrap hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Make Plans
                        </button>
                        {isRallyNight && (
                          rallySent ? (
                            <span className="flex-none inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#d4ff00]/20 text-[#d4ff00]/50 text-[13px] font-semibold whitespace-nowrap">
                              <Megaphone className="h-4 w-4" />
                              Rallied
                            </span>
                          ) : (
                            <button
                              onClick={handleRally}
                              className="flex-none inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#d4ff00]/40 text-[#d4ff00] text-[13px] font-semibold whitespace-nowrap hover:bg-[#d4ff00]/10 transition-colors"
                            >
                              <Megaphone className="h-4 w-4" />
                              Rally
                            </button>
                          )
                        )}
                      </>
                    )}
                    {/* Message — flex:none, matches button height */}
                    <button
                      onClick={handleOpenDM}
                      className="flex-none w-[42px] h-[42px] rounded-full flex items-center justify-center border border-white/15 text-white/50 hover:bg-white/5 transition-colors ml-1"
                    >
                      <MessageSquare className="h-[18px] w-[18px]" />
                    </button>
                  </>
                )}

                {/* Demo user who isn't on Spotted — show invite CTA */}
                {isDemoUser && !demoEnabled && (
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      onClick={handleInviteViaSms}
                      className="flex-1 py-2 px-5 rounded-full border-2 border-[#d4ff00] text-[#d4ff00] text-sm font-semibold hover:bg-[#d4ff00]/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <Share2 className="h-4 w-4" />
                      Invite to Spotted
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
      </>
    )}

    {/* Report Dialog */}
    {selectedFriend && (
      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        reportType="user"
        targetId={selectedFriend.userId}
        targetName={selectedFriend.displayName}
      />
    )}


    {/* Badge action confirm dialog */}
    <AlertDialog open={badgeConfirm !== null} onOpenChange={(open) => { if (!open) setBadgeConfirm(null); }}>
      <AlertDialogContent className="bg-[#1a0f2e] border border-[#a855f7]/40 z-[400]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {badgeConfirm === 'remove_close' && 'Remove as Close Friend?'}
            {badgeConfirm === 'add_close' && 'Add as Close Friend?'}
            {badgeConfirm === 'send_request' && `Send Friend Request to ${selectedFriend?.displayName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/60">
            {badgeConfirm === 'remove_close' && `${selectedFriend?.displayName} will remain a friend but won't see close-friends-only content.`}
            {badgeConfirm === 'add_close' && `${selectedFriend?.displayName} will see your close-friends-only posts and plans.`}
            {badgeConfirm === 'send_request' && `${selectedFriend?.displayName} will receive a friend request notification.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBadgeConfirm}
            className={badgeConfirm === 'remove_close'
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-[#a855f7] text-white hover:bg-[#a855f7]/80'}
          >
            {badgeConfirm === 'remove_close' && 'Remove'}
            {badgeConfirm === 'add_close' && 'Add'}
            {badgeConfirm === 'send_request' && 'Send Request'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Create Plan Dialog - rendered outside of selectedFriend check so it stays open after card closes */}
    {user && (
      <CreatePlanDialog
        open={showCreatePlanDialog}
        onOpenChange={(open) => {
          setShowCreatePlanDialog(open);
          if (!open) setPreselectedFriendForPlan(null);
        }}
        userId={user.id}
        onPlanCreated={handlePlanCreated}
        preselectedFriend={preselectedFriendForPlan}
      />
    )}
  </>
);
}
