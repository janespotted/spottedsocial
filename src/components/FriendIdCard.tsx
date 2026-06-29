import { useEffect, useState } from 'react';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, ChevronRight, CalendarPlus, Share2, Megaphone, UserPlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MessageSquare, MoreVertical, Flag, Ban, X as CloseIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/contexts/AuthContext';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
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
  const [venueCoords, setVenueCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showCreatePlanDialog, setShowCreatePlanDialog] = useState(false);
  const [rallySent, setRallySent] = useState(false);
  const [preselectedFriendForPlan, setPreselectedFriendForPlan] = useState<{
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null>(null);
  const [badgeConfirm, setBadgeConfirm] = useState<'add_close' | 'remove_close' | 'send_request' | null>(null);

  useEffect(() => {
    if (selectedFriend && user) {
      console.log('Friend ID Card opened for:', selectedFriend);
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
      const activeCheckIn = activeCheckInRes.data;

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
          setStatusSubtitle(neighborhood ? `@ Private Party · ${neighborhood}` : '@ Private Party');
        } else {
          const venueName = nightStatus.venue_name || null;
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
          setStatusSubtitle(venueName ? `@ ${venueName}` : 'Out now');
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
        setStatusSubtitle('Location hidden');
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
          await supabase
            .from('friendships')
            .insert({ user_id: user.id, friend_id: selectedFriend.userId, status: 'pending' });

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
                {/* Three-dot menu — top right */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="absolute right-4 top-4 z-20 w-7 h-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <MoreVertical className="h-4 w-4 text-white/50" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#1a0f2e] border-[#a855f7]/40">
                    <DropdownMenuItem
                      onClick={() => setShowReportDialog(true)}
                      className="text-white hover:bg-[#a855f7]/20 cursor-pointer"
                    >
                      <Flag className="h-4 w-4 mr-2" />
                      Report User
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleBlockUser}
                      className="text-red-400 hover:bg-red-500/20 cursor-pointer"
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Block User
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

              <div className="p-5">
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
                    {distance !== null && isOutStatus && (
                      <p className="text-white/30 text-xs leading-tight mt-0.5">
                        {distance.toFixed(1)} mi away
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
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
                            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[#a855f7]/20 transition-colors"
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
                  <div className="flex items-center gap-2 flex-1">
                    {/* Show "Meet Up" if friend is out, "Make Plans" otherwise */}
                    {isOutStatus ? (
                      <button
                        onClick={handleMeetUp}
                        className="flex-1 h-11 rounded-full bg-[#d4ff00] text-black text-sm font-semibold hover:bg-[#d4ff00]/90 transition-colors flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(212,255,0,0.25)]"
                      >
                        <UserPlus className="h-4 w-4" />
                        Meet Up
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleMakePlans}
                          className="flex-1 h-11 rounded-full border border-[#a855f7]/40 text-[#a855f7] text-sm font-semibold hover:bg-[#a855f7]/10 transition-colors flex items-center justify-center gap-2"
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Make Plans
                        </button>
                        {isRallyNight && (
                          rallySent ? (
                            <span className="h-11 px-4 rounded-full border border-[#d4ff00]/20 text-[#d4ff00]/50 text-sm font-semibold flex items-center justify-center gap-1.5">
                              <Megaphone className="h-4 w-4" />
                              Rallied
                            </span>
                          ) : (
                            <button
                              onClick={handleRally}
                              className="h-11 px-4 rounded-full border border-[#d4ff00]/40 text-[#d4ff00] text-sm font-semibold hover:bg-[#d4ff00]/10 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Megaphone className="h-4 w-4" />
                              Rally
                            </button>
                          )
                        )}
                      </>
                    )}
                    <button
                      onClick={handleOpenDM}
                      className="w-11 h-11 rounded-full flex items-center justify-center border border-white/15 text-white/50 hover:bg-white/5 transition-colors flex-shrink-0"
                    >
                      <MessageSquare className="h-5 w-5" />
                    </button>
                  </div>
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
