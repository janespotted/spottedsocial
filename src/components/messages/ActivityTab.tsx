import { useEffect, useState } from 'react';
import { isVenueOpen, VenueHours } from '@/lib/venue-hours';
import { isFromTonight } from '@/lib/time-context';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useImDown } from '@/contexts/ImDownContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logEvent } from '@/lib/event-logger';
import { triggerPushNotification } from '@/lib/push-notifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, Zap, UserPlus, MessageCircle, ChevronRight, Users, Target, Heart, TrendingUp, Megaphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode'; // kept for bootstrapEnabled in fetchAll dependency
import { useUserCity } from '@/hooks/useUserCity';
import { getDemoUsersForCity, getPromotedVenuesForCity } from '@/lib/demo-data';
import type { SupportedCity } from '@/lib/city-detection';
import { ActivitySkeleton } from './MessagesSkeleton';

interface Activity {
  id: string;
  type: 'check_in' | 'trending' | 'friend_request' | 'meet_up' | 'accepted_invite' | 'venue_invite' | 'post_like' | 'post_comment' | 'city_pulse' | 'meetup_accepted' | 'venue_invite_accepted' | 'dm_message' | 'venue_yap' | 'rally' | 'plan_down';
  title: string;
  subtitle?: string;
  timestamp: string;
  avatar_url?: string | null;
  user_id?: string;
  display_name?: string;
  venue_id?: string;
  action?: 'meet_up' | 'view' | 'accept_decline' | 'message';
  isAtVenue?: boolean;
  notificationId?: string;
}

// Session-based frequency limiting for city pulse (max 2 per session)
const PULSE_SESSION_KEY = 'spotted_city_pulse_count';
const MAX_PULSES_PER_SESSION = 2;

const getPulseCount = (): number => {
  try {
    return parseInt(sessionStorage.getItem(PULSE_SESSION_KEY) || '0', 10);
  } catch {
    return 0;
  }
};

const incrementPulseCount = (): void => {
  try {
    sessionStorage.setItem(PULSE_SESSION_KEY, String(getPulseCount() + 1));
  } catch {
    // Ignore storage errors
  }
};

const canShowPulse = (): boolean => getPulseCount() < MAX_PULSES_PER_SESSION;

const generateDemoActivities = (city: SupportedCity, userCurrentVenue: string | null): Activity[] => {
  const demoUsers = getDemoUsersForCity(city);
  const venues = getPromotedVenuesForCity(city);
  
  if (demoUsers.length < 4 || venues.length < 2) return [];
  
  return [
    {
      id: 'demo-meetup-1',
      type: 'meet_up',
      title: `${demoUsers[0].display_name} asked to`,
      subtitle: 'Meet Up',
      timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
      avatar_url: demoUsers[0].avatar_url,
      user_id: `demo-user-${demoUsers[0].username}`,
      display_name: demoUsers[0].display_name,
    },
    {
      id: 'demo-invite-1',
      type: 'venue_invite',
      title: `${demoUsers[1].display_name} invited you to`,
      subtitle: venues[0].name,
      timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
      avatar_url: demoUsers[1].avatar_url,
      user_id: `demo-user-${demoUsers[1].username}`,
      display_name: demoUsers[1].display_name,
      isAtVenue: userCurrentVenue ? venues[0].name.toLowerCase() === userCurrentVenue : false,
    },
    {
      id: 'demo-meetup-2',
      type: 'meet_up',
      title: `${demoUsers[2].display_name} asked to`,
      subtitle: 'Meet Up',
      timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
      avatar_url: demoUsers[2].avatar_url,
      user_id: `demo-user-${demoUsers[2].username}`,
      display_name: demoUsers[2].display_name,
    },
    {
      id: 'demo-invite-2',
      type: 'venue_invite',
      title: `${demoUsers[3].display_name} invited you to`,
      subtitle: venues[1].name,
      timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
      avatar_url: demoUsers[3].avatar_url,
      user_id: `demo-user-${demoUsers[3].username}`,
      display_name: demoUsers[3].display_name,
      isAtVenue: userCurrentVenue ? venues[1].name.toLowerCase() === userCurrentVenue : false,
    },
  ];
};

// Unified card style - consistent purple aesthetic
const CARD_STYLE = 'bg-[#2d1b4e]/60 border border-[#a855f7]/20';
// Unified avatar ring color - always purple
const AVATAR_RING_COLOR = 'border-[#a855f7]';

export function ActivityTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const { sendMeetUpNotification } = useMeetUp();
  const { triggerConfirmation } = useImDown();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();
  const { city } = useUserCity();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      fetchAll();
      fetchPlanningFriends();
    }
  }, [user, demoEnabled, bootstrapEnabled, city]);

  // Realtime subscriptions for live updates
  useEffect(() => {
    if (!user) return;
    
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchAll();
        fetchPlanningFriends();
      }, 2000);
    };

    const channel = supabase
      .channel('activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_id=eq.${user.id}` }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, debouncedRefresh)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchActivities(), fetchFriendRequests()]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFriendRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id')
      .eq('friend_id', user?.id)
      .eq('status', 'pending');

    setFriendRequestCount(data?.length || 0);
  };

  const fetchActivities = async () => {
    // Parallelize initial queries including real notifications
    // Use cached friend IDs
    const cachedFriendIds: string[] = queryClient.getQueryData(['friend-ids', user?.id]) || [];

    const [currentStatusResult, realInvitesResult] = await Promise.all([
      supabase.from('night_statuses').select('venue_name').eq('user_id', user?.id).eq('status', 'out').maybeSingle(),
      supabase.from('notifications')
        .select(`id, type, message, created_at, sender_id, is_read`)
        .eq('receiver_id', user?.id)
        .in('type', ['meetup_request', 'venue_invite', 'post_like', 'post_comment', 'meetup_accepted', 'venue_invite_accepted', 'venue_yap', 'rally', 'plan_down'])
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    const userCurrentVenue = currentStatusResult.data?.venue_name?.toLowerCase() || null;
    const friendIds = cachedFriendIds;

    const activityList: Activity[] = [];

    // Add real notifications/invites with sender profile lookup using safe RPC
    // Filter to tonight only (5am boundary)
    const tonightInvites = realInvitesResult.data?.filter(n => isFromTonight(n.created_at)) || [];
    if (tonightInvites.length) {
      const senderIds = [...new Set(tonightInvites.map(n => n.sender_id))];
      // Use cached profiles
      const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
      let senderProfiles = allProfiles.filter((p: any) => senderIds.includes(p.id));
      
      // Filter out demo users when demo mode is off
      if (!demoEnabled) {
        senderProfiles = senderProfiles.filter((p: any) => !p.is_demo);
      }
      
      const profileMap = new Map(senderProfiles?.map((p: any) => [p.id, p]) || []);
      
      // Filter invites to only those from non-demo users when demo mode is off
      const filteredInvites = !demoEnabled
        ? tonightInvites.filter(invite => profileMap.has(invite.sender_id))
        : tonightInvites;
      
      const realActivities: Activity[] = filteredInvites.map(invite => {
        const profile = profileMap.get(invite.sender_id);
        const isVenueInvite = invite.type === 'venue_invite';
        const isPostLike = invite.type === 'post_like';
        const isPostComment = invite.type === 'post_comment';
        const isMeetupAccepted = invite.type === 'meetup_accepted';
        const isVenueInviteAccepted = invite.type === 'venue_invite_accepted';
        const isVenueYap = invite.type === 'venue_yap';
        const isRally = invite.type === 'rally';
        const isPlanDown = invite.type === 'plan_down';
        
        // Extract venue name from message like "X invited you to VenueName."
        const venueMatch = invite.message.match(/invited you to (.+?)\.?\s*(?:Want to go\?)?$/i);
        const venueName = venueMatch?.[1] || 'a venue';
        
        // Map notification types to activity types
        let activityType: Activity['type'] = 'meet_up';
        if (isVenueInvite) activityType = 'venue_invite';
        if (isPostLike) activityType = 'post_like';
        if (isPostComment) activityType = 'post_comment';
        if (isMeetupAccepted) activityType = 'meetup_accepted';
        if (isVenueInviteAccepted) activityType = 'venue_invite_accepted';
        if (isVenueYap) activityType = 'venue_yap';
        if (isRally) activityType = 'rally';
        if (isPlanDown) activityType = 'plan_down';
        
        return {
          id: invite.id,
          type: activityType,
          title: profile?.display_name || 'Someone',
          subtitle: isVenueInvite ? venueName 
            : isPostLike ? 'liked your post' 
            : isPostComment ? invite.message 
            : isMeetupAccepted ? 'is down to meet up! 🎉'
            : isVenueInviteAccepted ? invite.message
            : isVenueYap ? invite.message
            : isRally ? invite.message
            : isPlanDown ? invite.message
            : 'Meet Up',
          timestamp: invite.created_at || new Date().toISOString(),
          avatar_url: profile?.avatar_url,
          user_id: invite.sender_id,
          display_name: profile?.display_name,
          isAtVenue: isVenueInvite && userCurrentVenue ? venueName.toLowerCase() === userCurrentVenue : false,
          notificationId: invite.id,
        };
      });
      activityList.push(...realActivities);
    }

    // Add demo activities ONLY if demo mode is enabled (not just bootstrap mode)
    if (demoEnabled) {
      const demoActivities = generateDemoActivities(city, userCurrentVenue);
      activityList.push(...demoActivities);
    }

    // Add trending venue from user's city - only open venues
    const { data: trendingVenues } = await supabase
      .from('venues')
      .select('id, name, operating_hours')
      .eq('city', city)
      .order('popularity_rank', { ascending: true })
      .limit(15);
    
    if (trendingVenues && trendingVenues.length > 0) {
      // Filter to only open venues
      const openVenues = trendingVenues.filter(venue => 
        isVenueOpen(venue.operating_hours as VenueHours | null)
      );
      
      if (openVenues.length > 0) {
        // Pick a random venue from top 5 open venues
        const topOpenVenues = openVenues.slice(0, 5);
        const randomVenue = topOpenVenues[Math.floor(Math.random() * topOpenVenues.length)];
        
        // Get actual check-in count for this venue (only non-demo in bootstrap mode)
        let checkInQuery = supabase
          .from('checkins')
          .select('id', { count: 'exact', head: true })
          .eq('venue_id', randomVenue.id)
          .is('ended_at', null);
        
        // Only count real check-ins when demo mode is off
        if (!demoEnabled) {
          checkInQuery = checkInQuery.eq('is_demo', false);
        }
        
        const { count: checkInCount } = await checkInQuery;
        const realCount = checkInCount || 0;
        
        // Only show trending if there are actual check-ins OR if demo mode is enabled
        if (realCount > 0 || demoEnabled) {
          const subtitle = demoEnabled 
            ? '12+ here now' 
            : realCount > 0 
              ? `${realCount} here now` 
              : 'Trending spot';
          
          activityList.push({
            id: 'trending-1',
            type: 'trending',
            title: `${randomVenue.name} is trending`,
            subtitle,
            timestamp: new Date(Date.now() - 300000).toISOString(),
            action: 'view',
            venue_id: randomVenue.id,
          });
        }
      }
    }

    // Fetch city pulse data (only if not demo mode and can show pulse)
    if (!demoEnabled && canShowPulse()) {
      // Get neighborhood activity in last hour - real check-ins only
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data: neighborhoodActivity } = await supabase
        .from('checkins')
        .select(`
          venue_id,
          venues!inner (
            neighborhood,
            city
          )
        `)
        .is('ended_at', null)
        .gte('created_at', oneHourAgo)
        .eq('is_demo', false);

      if (neighborhoodActivity && neighborhoodActivity.length > 0) {
        // Filter to user's city and count by neighborhood
        const neighborhoodCounts = new Map<string, number>();
        
        for (const checkIn of neighborhoodActivity) {
          const venue = checkIn.venues as unknown as { neighborhood: string; city: string };
          if (venue?.city === city && venue?.neighborhood) {
            neighborhoodCounts.set(
              venue.neighborhood,
              (neighborhoodCounts.get(venue.neighborhood) || 0) + 1
            );
          }
        }

        // Find the neighborhood with most activity (minimum 3 check-ins)
        let topNeighborhood: string | null = null;
        let topCount = 0;
        
        for (const [neighborhood, count] of neighborhoodCounts.entries()) {
          if (count >= 3 && count > topCount) {
            topNeighborhood = neighborhood;
            topCount = count;
          }
        }

        // Add city pulse if we found meaningful activity
        if (topNeighborhood && topCount >= 3) {
          incrementPulseCount(); // Track that we're showing a pulse
          
          activityList.push({
            id: `city-pulse-${Date.now()}`,
            type: 'city_pulse',
            title: `${topCount} people checked in around ${topNeighborhood}`,
            subtitle: 'in the last hour',
            timestamp: new Date(Date.now() - 10 * 60000).toISOString(), // Show as "10m ago"
          });
        }
      }
    }

    // Fetch top yap at user's current venue
    if (userCurrentVenue) {
      const { data: topYap } = await supabase
        .from('yap_messages')
        .select('id, text, venue_name, score, created_at')
        .eq('venue_name', currentStatusResult.data?.venue_name || '')
        .neq('user_id', user?.id || '')
        .gt('expires_at', new Date().toISOString())
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topYap && topYap.text) {
        const preview = topYap.text.length > 40 ? topYap.text.slice(0, 40) + '…' : topYap.text;
        activityList.push({
          id: `top-yap-${topYap.id}`,
          type: 'venue_yap',
          title: `Top Yap @${topYap.venue_name}`,
          subtitle: `"${preview}"`,
          timestamp: topYap.created_at || new Date().toISOString(),
        });
      }
    }

    // Set initial activities immediately (fast render with real invites/demo/trending)
    setActivities(activityList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    // Fetch check-ins from friends in background (progressive enhancement)
    if (friendIds.length > 0) {
      // Calculate tonight's 5am cutoff for filtering
      const now = new Date();
      const tonightCutoff = new Date(now);
      if (now.getHours() < 5) {
        // Before 5am: cutoff is 5am yesterday
        tonightCutoff.setDate(tonightCutoff.getDate() - 1);
      }
      tonightCutoff.setHours(5, 0, 0, 0);

      const { data: checkIns } = await supabase
        .from('checkins')
        .select(`
          *,
          profiles:user_id (
            display_name,
            avatar_url
          )
        `)
        .in('user_id', friendIds)
        .is('ended_at', null)
        .gte('started_at', tonightCutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (checkIns?.length) {
        // Filter out demo check-ins when demo mode is off
        const demoFiltered = !demoEnabled
          ? checkIns.filter(checkIn => !checkIn.is_demo)
          : checkIns;
        
        // Filter out stale check-ins (last_updated_at > 2 hours ago)
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        const filteredCheckIns = demoFiltered.filter(c => {
          const lastUpdate = c.last_updated_at || c.started_at;
          if (!lastUpdate) return false;
          return Date.now() - new Date(lastUpdate).getTime() < TWO_HOURS_MS;
        });
        
        // Deduplicate: keep only the most recent check-in per user
        const seenUsers = new Map<string, typeof filteredCheckIns[0]>();
        for (const checkIn of filteredCheckIns) {
          const existing = seenUsers.get(checkIn.user_id);
          if (!existing || new Date(checkIn.created_at || 0).getTime() > new Date(existing.created_at || 0).getTime()) {
            seenUsers.set(checkIn.user_id, checkIn);
          }
        }
        const uniqueCheckIns = Array.from(seenUsers.values());

        // Use cached profiles as fallback for missing profile data
        const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
        const profileMap = new Map(allProfiles.map((p: any) => [p.id, p]));
        
        const checkInActivities: Activity[] = uniqueCheckIns.map(checkIn => {
          const profileName = checkIn.profiles?.display_name || profileMap.get(checkIn.user_id)?.display_name || 'Friend';
          const profileAvatar = checkIn.profiles?.avatar_url || profileMap.get(checkIn.user_id)?.avatar_url || null;
          return {
            id: checkIn.id,
            type: 'check_in' as const,
            title: `${profileName} arrived at the`,
            subtitle: checkIn.venue_name,
            timestamp: checkIn.created_at || new Date().toISOString(),
            avatar_url: profileAvatar,
            user_id: checkIn.user_id,
            display_name: profileName,
            action: 'meet_up' as const,
          };
        });
        
        // Merge check-ins with existing activities
        setActivities(prev => {
          const merged = [...prev, ...checkInActivities];
          return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        });
      }
    }

    // Fetch recent DMs from friends as activity items
    if (friendIds.length > 0) {
      const { data: recentDms } = await supabase
        .from('dm_messages')
        .select('id, sender_id, text, created_at, thread_id')
        .in('sender_id', friendIds)
        .neq('sender_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (recentDms?.length) {
        // Deduplicate: one DM per sender (most recent)
        const seenSenders = new Map<string, typeof recentDms[0]>();
        for (const dm of recentDms) {
          if (!seenSenders.has(dm.sender_id)) {
            seenSenders.set(dm.sender_id, dm);
          }
        }
        let uniqueDms = Array.from(seenSenders.values());

        const dmProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
        const dmProfileMap = new Map(dmProfiles.map((p: any) => [p.id, p]));

        // Filter out DMs from demo users when demo mode is off
        if (!demoEnabled) {
          uniqueDms = uniqueDms.filter(dm => {
            const profile = dmProfileMap.get(dm.sender_id);
            return !profile?.is_demo;
          });
        }

        const dmActivities: Activity[] = uniqueDms.map(dm => {
          const profile = dmProfileMap.get(dm.sender_id);
          const preview = dm.text.length > 40 ? dm.text.slice(0, 40) + '...' : dm.text;
          return {
            id: `dm-${dm.id}`,
            type: 'dm_message' as const,
            title: profile?.display_name || 'Someone',
            subtitle: preview,
            timestamp: dm.created_at || new Date().toISOString(),
            avatar_url: profile?.avatar_url || null,
            user_id: dm.sender_id,
            display_name: profile?.display_name || 'Someone',
            action: 'message' as const,
          };
        });

        setActivities(prev => {
          const merged = [...prev, ...dmActivities];
          return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        });
      }
    }
  };

  const getTimeAgo = (date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    return distance.replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h');
  };

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'trending':
        return <Zap className="h-5 w-5 text-[#d4ff00] animate-pulse" />;
      case 'friend_request':
        return <UserPlus className="h-5 w-5 text-[#d4ff00]" />;
      case 'meet_up':
        return <Users className="h-5 w-5 text-[#a855f7]" />;
      case 'venue_invite':
        return <MapPin className="h-5 w-5 text-[#d4ff00]" />;
      case 'post_like':
        return <Heart className="h-5 w-5 text-red-500 fill-red-500" />;
      case 'post_comment':
        return <MessageCircle className="h-5 w-5 text-blue-400" />;
      case 'meetup_accepted':
      case 'venue_invite_accepted':
        return <Heart className="h-5 w-5 text-[#d4ff00]" />;
      case 'venue_yap':
        return <MessageCircle className="h-5 w-5 text-[#d4ff00]" />;
      case 'rally':
        return <Megaphone className="h-5 w-5 text-[#d4ff00]" />;
      case 'plan_down':
        return <span className="text-lg">🎉</span>;
      case 'dm_message':
        return <MessageCircle className="h-5 w-5 text-[#a855f7]" />;
      case 'city_pulse':
        return <MapPin className="h-5 w-5 text-white/40" />;
      default:
        return null;
    }
  };

  const handleMeetUp = async (activity: Activity) => {
    if (!activity.user_id || !activity.display_name) return;
    
    await sendMeetUpNotification(
      activity.user_id,
      activity.display_name,
      activity.avatar_url || null
    );
  };

  const handleAcceptMeetUp = async (activity: Activity) => {
    if (!user || !activity.user_id || !activity.display_name) return;

    // Get current user's display name using safe RPC (own profile is always visible)
    const { data: profiles } = await supabase.rpc('get_profile_safe', { target_user_id: user.id });
    const profile = profiles?.[0];

    const myName = profile?.display_name?.split(' ')[0] || 'Someone';

    // Send acceptance notification back
    if (!activity.user_id.startsWith('demo-')) {
      const acceptMessage = `${myName} is down to meet up! 🎉`;
      const { data: notifData } = await supabase.rpc('create_notification', {
        p_receiver_id: activity.user_id,
        p_type: 'meetup_accepted',
        p_message: acceptMessage,
      });
      
      const notif = Array.isArray(notifData) ? notifData[0] : notifData;
      if (notif) {
        triggerPushNotification({
          id: notif.id,
          receiver_id: activity.user_id,
          sender_id: user.id,
          type: 'meetup_accepted',
          message: acceptMessage,
        });
      }
      
      // Delete the original notification so it doesn't reappear
      if (activity.notificationId) {
        await supabase.from('notifications').delete().eq('id', activity.notificationId);
      }
      
      // Log invite accepted
      logEvent('invite_accepted', {
        type: 'meetup_request',
        sender_id: activity.user_id,
        sender_name: activity.display_name,
      });
    }

    // Remove from activity list
    setActivities(prev => prev.filter(a => a.id !== activity.id));

    // Show confirmation card
    triggerConfirmation(
      activity.user_id,
      activity.display_name,
      activity.avatar_url || null,
      'meet_up'
    );
  };

  const handleAcceptVenueInvite = async (activity: Activity) => {
    if (!user || !activity.user_id || !activity.display_name) return;

    // Get current user's display name using safe RPC (own profile is always visible)
    const { data: profiles } = await supabase.rpc('get_profile_safe', { target_user_id: user.id });
    const profile = profiles?.[0];

    const myName = profile?.display_name?.split(' ')[0] || 'Someone';

    // Send acceptance notification back
    if (!activity.user_id.startsWith('demo-')) {
      const acceptMessage = `${myName} is down for ${activity.subtitle}! 🎉`;
      const { data: notifData } = await supabase.rpc('create_notification', {
        p_receiver_id: activity.user_id,
        p_type: 'venue_invite_accepted',
        p_message: acceptMessage,
      });
      
      const notif = Array.isArray(notifData) ? notifData[0] : notifData;
      if (notif) {
        triggerPushNotification({
          id: notif.id,
          receiver_id: activity.user_id,
          sender_id: user.id,
          type: 'venue_invite_accepted',
          message: acceptMessage,
        });
      }
      
      // Delete the original notification so it doesn't reappear
      if (activity.notificationId) {
        await supabase.from('notifications').delete().eq('id', activity.notificationId);
      }
      
      // Log invite accepted
      logEvent('invite_accepted', {
        type: 'venue_invite',
        sender_id: activity.user_id,
        sender_name: activity.display_name,
        venue_name: activity.subtitle,
      });
    }

    // Remove from activity list
    setActivities(prev => prev.filter(a => a.id !== activity.id));

    // Show confirmation card
    triggerConfirmation(
      activity.user_id,
      activity.display_name,
      activity.avatar_url || null,
      'venue_invite',
      activity.subtitle
    );
  };

  const handleOpenChat = (activity: Activity) => {
    if (!activity.user_id || !activity.display_name) return;
    
    navigate('/messages', {
      state: {
        preselectedUser: {
          id: activity.user_id,
          display_name: activity.display_name,
          avatar_url: activity.avatar_url || null,
        }
      }
    });
  };

  const handleViewVenue = (venueId?: string, venueName?: string) => {
    if (venueId) {
      openVenueCard(venueId);
    } else if (venueName) {
      toast({
        title: venueName,
        description: "Venue details coming soon!",
      });
    }
  };

  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);




  const fetchPlanningFriends = async () => {
    if (!user) return;
    
    // Get friend IDs
    const [sentResult, receivedResult] = await Promise.all([
      supabase.from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'accepted'),
      supabase.from('friendships').select('user_id').eq('friend_id', user.id).eq('status', 'accepted')
    ]);

    const friendIds = [
      ...(sentResult.data?.map(f => f.friend_id) || []),
      ...(receivedResult.data?.map(f => f.user_id) || [])
    ];

    if (friendIds.length === 0) {
      setPlanningFriends([]);
      return;
    }

    // Get friends with planning status (including neighborhood)
    // In bootstrap mode, also filter out demo night_statuses
    let statusQuery = supabase
      .from('night_statuses')
      .select('user_id, planning_neighborhood, is_demo')
      .in('user_id', friendIds)
      .eq('status', 'planning')
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());
    
    // Filter out demo statuses in bootstrap mode
    if (bootstrapEnabled && !demoEnabled) {
      statusQuery = statusQuery.eq('is_demo', false);
    }
    
    const { data: planningStatuses } = await statusQuery;

    if (!planningStatuses || planningStatuses.length === 0) {
      setPlanningFriends([]);
      return;
    }

    const planningUserIds = planningStatuses.map(s => s.user_id);
    const neighborhoodMap = new Map(planningStatuses.map(s => [s.user_id, s.planning_neighborhood]));

    // Get profiles for planning friends - use safe RPC
    const { data: allProfiles } = await supabase.rpc('get_profiles_safe');
    const profiles = (allProfiles || []).filter((p: any) => planningUserIds.includes(p.id));

    // In bootstrap mode (not demo mode), filter out demo users
    const filteredProfiles = (bootstrapEnabled && !demoEnabled)
      ? profiles.filter((p: any) => !p.is_demo)
      : profiles;

    setPlanningFriends(filteredProfiles.map((p: any) => ({
      user_id: p.id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      planning_neighborhood: neighborhoodMap.get(p.id) || null,
    })));
  };

  if (isLoading) {
    return <ActivitySkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Friend Requests - Always at top */}
      <div
        onClick={() => navigate('/friends', { state: { tab: 'requests' } })}
        className="bg-gradient-to-r from-[#2d1b4e]/80 to-[#3d1b5e]/60 border border-[#a855f7]/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#2d1b4e]/80 transition-all hover:border-[#a855f7]/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#1a0f2e] border-2 border-[#a855f7] flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.4)]">
            <UserPlus className="h-6 w-6 text-[#d4ff00]" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Friend Requests</h3>
            <p className="text-white/60 text-sm">
              {friendRequestCount > 0 ? `${friendRequestCount} pending request${friendRequestCount > 1 ? 's' : ''}` : 'Find and add friends'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {friendRequestCount > 0 && <div className="bg-[#a855f7] rounded-full w-2.5 h-2.5 animate-pulse" />}
          <ChevronRight className="h-5 w-5 text-white/40" />
        </div>
      </div>

      {/* Friends Planning / PGing Section */}
      {planningFriends.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#a855f7]" />
            <h3 className="text-sm font-semibold text-white">Friends Planning / PGing</h3>
            <span className="text-white/40 text-xs">{planningFriends.length} deciding</span>
          </div>
          <div className="space-y-2">
            {planningFriends.map((friend) => (
              <div
                key={friend.user_id}
                className={`rounded-2xl p-3 transition-all ${CARD_STYLE}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openFriendCard({
                      userId: friend.user_id,
                      displayName: friend.display_name,
                      avatarUrl: friend.avatar_url,
                    })}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <Avatar className={`h-10 w-10 border-2 ${AVATAR_RING_COLOR}`}>
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                        {friend.display_name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                    <p className="text-[#a855f7] text-xs">
                      {friend.planning_neighborhood 
                        ? `Planning tonight (${friend.planning_neighborhood})`
                        : 'Planning tonight'}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate('/messages', {
                      state: {
                        preselectedUser: {
                          id: friend.user_id,
                          display_name: friend.display_name,
                          avatar_url: friend.avatar_url
                        }
                      }
                    })}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                  >
                    Make plans
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Header */}
      <h2 className="text-2xl font-bold text-white">Activity</h2>

      {/* Sectioned Activity List */}
      {(() => {
        // Group activities by section
        const invites = activities.filter(a => a.type === 'meet_up' || a.type === 'venue_invite');
        const friendsOut = activities.filter(a => a.type === 'check_in');
        const trending = activities.filter(a => a.type === 'trending');
        const postEngagement = activities.filter(a => a.type === 'post_like' || a.type === 'post_comment');
        const cityPulse = activities.filter(a => a.type === 'city_pulse');
        const acceptedInvites = activities.filter(a => a.type === 'meetup_accepted' || a.type === 'venue_invite_accepted');
        const dmMessages = activities.filter(a => a.type === 'dm_message');
        const venueYaps = activities.filter(a => a.type === 'venue_yap');
        const rallies = activities.filter(a => a.type === 'rally');
        const planDowns = activities.filter(a => a.type === 'plan_down');

        // Special muted style for city pulse
        const PULSE_CARD_STYLE = 'bg-[#1a0f2e]/40 border border-white/10';

        const renderActivityCard = (activity: Activity) => (
          <div
            key={activity.id}
            className={`rounded-2xl p-4 transition-all hover:scale-[1.01] ${activity.type === 'city_pulse' ? PULSE_CARD_STYLE : CARD_STYLE}`}
          >
            <div className="flex items-start gap-3">
              {/* Icon/Avatar */}
              <div className="flex-shrink-0">
                {activity.type === 'trending' ? (
                  <div className="w-11 h-11 rounded-full bg-[#a855f7]/20 border-2 border-[#a855f7]/60 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.4)]">
                    {getActivityIcon(activity.type)}
                  </div>
                ) : activity.type === 'venue_yap' ? (
                  <div className="w-11 h-11 rounded-full bg-purple-500/20 border-2 border-purple-400/60 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-[#d4ff00]" />
                  </div>
                ) : activity.avatar_url !== undefined ? (
                  <button
                    onClick={() => activity.user_id && openFriendCard({
                      userId: activity.user_id,
                      displayName: activity.display_name || activity.title,
                      avatarUrl: activity.avatar_url || null,
                      venueName: activity.type === 'check_in' ? activity.subtitle : undefined,
                    })}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <Avatar className={`h-11 w-11 border-2 ${AVATAR_RING_COLOR} cursor-pointer shadow-[0_0_10px_rgba(168,85,247,0.3)]`}>
                      <AvatarImage src={activity.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                        {activity.display_name?.[0] || activity.title[0]}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                ) : (
                  <div className={`w-11 h-11 rounded-full bg-[#1a0f2e] border-2 ${AVATAR_RING_COLOR} flex items-center justify-center`}>
                    {getActivityIcon(activity.type)}
                  </div>
                )}
              </div>

              {/* Content - takes available space */}
              <div className="flex-1 min-w-0">
                {activity.type === 'meet_up' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-white/70 block text-xs mt-0.5">wants to meet up</span>
                  </div>
                )}
                {activity.type === 'venue_invite' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5">inviting you to {activity.subtitle}</span>
                  </div>
                )}
                {activity.type === 'check_in' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5">@{activity.subtitle}</span>
                  </div>
                )}
                {activity.type === 'trending' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[#d4ff00] mr-1" />
                      <span className="font-semibold text-[#d4ff00]">{activity.title.replace(' is trending', '')}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-white/70 block text-xs mt-0.5">is trending · {activity.subtitle}</span>
                  </div>
                )}
                {activity.type === 'post_like' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-white/70 text-xs mt-0.5 flex items-center gap-0.5"><Heart className="h-3.5 w-3.5 text-red-400 inline" /> liked your post</span>
                  </div>
                )}
                {activity.type === 'city_pulse' && (
                  <div className="text-white/60 text-sm">
                    <span>{activity.title}</span>
                    <span className="text-white/40 text-xs block mt-0.5">{activity.subtitle}</span>
                  </div>
                )}
                {activity.type === 'post_comment' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-white/70 block text-xs mt-0.5 line-clamp-1">
                      {activity.subtitle?.replace(/^.+? commented: /, '') || 'commented on your post'}
                    </span>
                  </div>
                )}
                {(activity.type === 'meetup_accepted' || activity.type === 'venue_invite_accepted') && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5">{activity.subtitle}</span>
                  </div>
                )}
                {activity.type === 'dm_message' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-white/70 block text-xs mt-0.5 line-clamp-1">messaged you: {activity.subtitle}</span>
                  </div>
                )}
                {activity.type === 'rally' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5">wants you to rally! Come out tonight 👋</span>
                  </div>
                )}
                {activity.type === 'venue_yap' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">New yap</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5 line-clamp-1">{activity.subtitle || 'at your spot'}</span>
                  </div>
                )}
                {activity.type === 'plan_down' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5">{activity.subtitle}</span>
                  </div>
                )}
              </div>

              {/* Actions - fixed on right */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {activity.type === 'meet_up' && (
                  <Button
                    onClick={() => handleAcceptMeetUp(activity)}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    I'm down!
                  </Button>
                )}

                {activity.type === 'venue_invite' && (
                  activity.isAtVenue ? (
                    <Button
                      onClick={() => handleOpenChat(activity)}
                      size="sm"
                      className="h-8 bg-[#d4ff00] hover:bg-[#d4ff00]/80 text-[#1a0f2e] rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(212,255,0,0.5)] hover:shadow-[0_0_16px_rgba(212,255,0,0.7)] transition-all"
                    >
                      Say hi!
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleAcceptVenueInvite(activity)}
                      size="sm"
                      className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                    >
                      I'm down!
                    </Button>
                  )
                )}

                {activity.type === 'check_in' && (
                  <Button
                    onClick={() => handleMeetUp(activity)}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    Meet Up
                  </Button>
                )}

                {activity.type === 'trending' && (
                  <Button
                    onClick={() => handleViewVenue(activity.venue_id, activity.title.replace(' is trending', ''))}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    View
                  </Button>
                )}

                {(activity.type === 'meetup_accepted' || activity.type === 'venue_invite_accepted') && (
                  <Button
                    onClick={() => handleOpenChat(activity)}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" />
                    Chat
                  </Button>
                )}

                {activity.type === 'dm_message' && (
                  <Button
                    onClick={() => handleOpenChat(activity)}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    View
                  </Button>
                )}

                {activity.type === 'rally' && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleOpenChat(activity)}
                      size="sm"
                      className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-3 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                    >
                      <MessageCircle className="h-3.5 w-3.5 mr-1" />
                      Message
                    </Button>
                  </div>
                )}

                {activity.type === 'venue_yap' && (
                  <Button
                    onClick={() => navigate('/messages', { state: { activeTab: 'yap' } })}
                    size="sm"
                    className="h-8 bg-[#d4ff00] hover:bg-[#d4ff00]/80 text-black rounded-full px-4 text-xs font-medium"
                  >
                    View
                  </Button>
                )}

              </div>
            </div>
          </div>
        );

        const hasContent = invites.length > 0 || friendsOut.length > 0 || trending.length > 0 || postEngagement.length > 0 || cityPulse.length > 0 || acceptedInvites.length > 0 || dmMessages.length > 0 || venueYaps.length > 0 || rallies.length > 0;

        return hasContent ? (
          <div className="space-y-5">
      {/* Section 1: Invites to You - Always visible */}
      <div className="space-y-3">
        <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
          Invites to You
        </h3>
        {invites.length > 0 ? (
          <div className="space-y-3">
            {invites.map(renderActivityCard)}
          </div>
        ) : (
          <div className="bg-gradient-to-r from-[#2d1b4e]/40 to-[#3d1b5e]/30 border border-[#a855f7]/20 rounded-2xl p-4 text-center">
            <p className="text-white/50 text-sm">No invites yet</p>
            <p className="text-white/30 text-xs mt-1">When friends invite you out, you'll see them here</p>
          </div>
        )}
      </div>

            {/* Section: Rallies */}
            {rallies.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  📣 Rallies
                </h3>
                <div className="space-y-3">
                  {rallies.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section: Accepted Invites */}
            {acceptedInvites.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  Accepted
                </h3>
                <div className="space-y-3">
                  {acceptedInvites.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section: Yaps at Your Location */}
            {venueYaps.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  💬 Yaps at Your Spot
                </h3>
                <div className="space-y-3">
                  {venueYaps.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section: Messages */}
            {dmMessages.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  Messages
                </h3>
                <div className="space-y-3">
                  {dmMessages.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section 2: Post Engagement (Likes & Comments) */}
            {postEngagement.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  Likes & Comments
                </h3>
                <div className="space-y-3">
                  {postEngagement.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section 3: Friends Out Now */}
            {friendsOut.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  Friends Out Now
                </h3>
                <div className="space-y-3">
                  {friendsOut.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section 4: Trending Now */}
            {trending.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  Trending Now
                </h3>
                <div className="space-y-3">
                  {trending.map(renderActivityCard)}
                </div>
              </div>
            )}

            {/* Section 5: City Pulse - Ambient signal (no header, subtle) */}
            {cityPulse.length > 0 && (
              <div className="space-y-3 opacity-80">
                {cityPulse.map(renderActivityCard)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6 border border-[#a855f7]/20">
              <MapPin className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Nothing yet — but that's okay
            </h3>
            <p className="text-white/50 text-sm max-w-xs mb-4">
              When friends invite you or show up nearby, you'll see it here.
            </p>
            <p className="text-white/30 text-xs">
              💡 Go live to let friends know you're around
            </p>
          </div>
        );
      })()}
    </div>
  );
}
