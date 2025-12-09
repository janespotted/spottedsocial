import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useImDown } from '@/contexts/ImDownContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logEvent } from '@/lib/event-logger';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, Zap, UserPlus, MessageCircle, ChevronRight, Users, Target } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useUserCity } from '@/hooks/useUserCity';
import { getDemoUsersForCity, getPromotedVenuesForCity } from '@/lib/demo-data';
import type { SupportedCity } from '@/lib/city-detection';
import { ActivitySkeleton } from './MessagesSkeleton';

interface Activity {
  id: string;
  type: 'check_in' | 'trending' | 'friend_request' | 'meet_up' | 'accepted_invite' | 'venue_invite';
  title: string;
  subtitle?: string;
  timestamp: string;
  avatar_url?: string | null;
  user_id?: string;
  display_name?: string;
  venue_id?: string;
  action?: 'meet_up' | 'view' | 'accept_decline' | 'message';
  isAtVenue?: boolean;
}

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

  useEffect(() => {
    if (user) {
      fetchAll();
    }
  }, [user, demoEnabled, bootstrapEnabled, city]);

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
    const [currentStatusResult, sentFriendshipsResult, receivedFriendshipsResult, realInvitesResult] = await Promise.all([
      supabase.from('night_statuses').select('venue_name').eq('user_id', user?.id).eq('status', 'out').maybeSingle(),
      supabase.from('friendships').select('friend_id').eq('user_id', user?.id).eq('status', 'accepted'),
      supabase.from('friendships').select('user_id').eq('friend_id', user?.id).eq('status', 'accepted'),
      supabase.from('notifications')
        .select(`id, type, message, created_at, sender_id, is_read`)
        .eq('receiver_id', user?.id)
        .in('type', ['meetup_request', 'venue_invite'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const userCurrentVenue = currentStatusResult.data?.venue_name?.toLowerCase() || null;
    const friendIds = [
      ...(sentFriendshipsResult.data?.map(f => f.friend_id) || []),
      ...(receivedFriendshipsResult.data?.map(f => f.user_id) || [])
    ];

    const activityList: Activity[] = [];

    // Add real notifications/invites with sender profile lookup using safe RPC
    if (realInvitesResult.data?.length) {
      const senderIds = [...new Set(realInvitesResult.data.map(n => n.sender_id))];
      // Use safe RPC to get profiles (respects location privacy)
      const { data: allProfiles } = await supabase.rpc('get_profiles_safe');
      let senderProfiles = (allProfiles || []).filter((p: any) => senderIds.includes(p.id));
      
      // In bootstrap mode (not demo mode), filter out demo users
      if (bootstrapEnabled && !demoEnabled) {
        senderProfiles = senderProfiles.filter((p: any) => !p.is_demo);
      }
      
      const profileMap = new Map(senderProfiles?.map((p: any) => [p.id, p]) || []);
      
      // Filter invites to only those from non-demo users in bootstrap mode
      const filteredInvites = (bootstrapEnabled && !demoEnabled)
        ? realInvitesResult.data.filter(invite => profileMap.has(invite.sender_id))
        : realInvitesResult.data;
      
      const realActivities: Activity[] = filteredInvites.map(invite => {
        const profile = profileMap.get(invite.sender_id);
        const isVenueInvite = invite.type === 'venue_invite';
        // Extract venue name from message like "X invited you to VenueName."
        const venueMatch = invite.message.match(/invited you to (.+?)\.?\s*(?:Want to go\?)?$/i);
        const venueName = venueMatch?.[1] || 'a venue';
        
        return {
          id: invite.id,
          type: isVenueInvite ? 'venue_invite' : 'meet_up',
          title: profile?.display_name || 'Someone',
          subtitle: isVenueInvite ? venueName : 'Meet Up',
          timestamp: invite.created_at || new Date().toISOString(),
          avatar_url: profile?.avatar_url,
          user_id: invite.sender_id,
          display_name: profile?.display_name,
          isAtVenue: isVenueInvite && userCurrentVenue ? venueName.toLowerCase() === userCurrentVenue : false,
        };
      });
      activityList.push(...realActivities);
    }

    // Add demo activities ONLY if demo mode is enabled (not just bootstrap mode)
    if (demoEnabled) {
      const demoActivities = generateDemoActivities(city, userCurrentVenue);
      activityList.push(...demoActivities);
    }

    // Add trending venue from user's city
    const { data: trendingVenue } = await supabase
      .from('venues')
      .select('id, name')
      .eq('city', city)
      .order('popularity_rank', { ascending: true })
      .limit(5);
    
    if (trendingVenue && trendingVenue.length > 0) {
      // Pick a random venue from top 5
      const randomVenue = trendingVenue[Math.floor(Math.random() * trendingVenue.length)];
      activityList.push({
        id: 'trending-1',
        type: 'trending',
        title: `${randomVenue.name} is trending`,
        subtitle: '12+ here now',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        action: 'view',
        venue_id: randomVenue.id,
      });
    }

    // Set initial activities immediately (fast render with real invites/demo/trending)
    setActivities(activityList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    // Fetch check-ins from friends in background (progressive enhancement)
    if (friendIds.length > 0) {
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
        .order('created_at', { ascending: false })
        .limit(10);

      if (checkIns?.length) {
        // In bootstrap mode (not demo mode), filter out check-ins from demo users
        const filteredCheckIns = (bootstrapEnabled && !demoEnabled)
          ? checkIns.filter(checkIn => {
              // Check if user is demo - we need to look up in profiles
              // For now, filter by checking if the user_id matches any demo pattern
              return !checkIn.is_demo;
            })
          : checkIns;
        
        const checkInActivities: Activity[] = filteredCheckIns.map(checkIn => ({
          id: checkIn.id,
          type: 'check_in' as const,
          title: `${checkIn.profiles?.display_name} arrived at the`,
          subtitle: checkIn.venue_name,
          timestamp: checkIn.created_at || new Date().toISOString(),
          avatar_url: checkIn.profiles?.avatar_url,
          user_id: checkIn.user_id,
          display_name: checkIn.profiles?.display_name,
          action: 'meet_up' as const,
        }));
        
        // Merge check-ins with existing activities
        setActivities(prev => {
          const merged = [...prev, ...checkInActivities];
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
      await supabase.from('notifications').insert({
        sender_id: user.id,
        receiver_id: activity.user_id,
        type: 'meetup_accepted',
        message: `${myName} is down to meet up! 🎉`,
      });
      
      // Log invite accepted
      logEvent('invite_accepted', {
        type: 'meetup_request',
        sender_id: activity.user_id,
        sender_name: activity.display_name,
      });
    }

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
      await supabase.from('notifications').insert({
        sender_id: user.id,
        receiver_id: activity.user_id,
        type: 'venue_invite_accepted',
        message: `${myName} is down for ${activity.subtitle}! 🎉`,
      });
      
      // Log invite accepted
      logEvent('invite_accepted', {
        type: 'venue_invite',
        sender_id: activity.user_id,
        sender_name: activity.display_name,
        venue_name: activity.subtitle,
      });
    }

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
          userId: activity.user_id,
          displayName: activity.display_name,
          avatarUrl: activity.avatar_url || null,
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

  useEffect(() => {
    if (user) {
      fetchAll();
      fetchPlanningFriends();
    }
  }, [user, demoEnabled, bootstrapEnabled, city]);

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
    const { data: planningStatuses } = await supabase
      .from('night_statuses')
      .select('user_id, planning_neighborhood')
      .in('user_id', friendIds)
      .eq('status', 'planning')
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

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
        onClick={() => navigate('/friend-requests')}
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
            <span className="text-lg">🎯</span>
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

        const renderActivityCard = (activity: Activity) => (
          <div
            key={activity.id}
            className={`rounded-2xl p-4 transition-all hover:scale-[1.01] ${CARD_STYLE}`}
          >
            <div className="flex items-start gap-3">
              {/* Icon/Avatar */}
              <div className="flex-shrink-0">
                {activity.type === 'trending' ? (
                  <div className="w-11 h-11 rounded-full bg-[#a855f7]/20 border-2 border-[#a855f7]/60 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.4)]">
                    {getActivityIcon(activity.type)}
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
                  <p className="text-white text-sm">
                    <span className="font-semibold">{activity.display_name}</span>
                    <span className="text-white/70"> wants to meet up</span>
                  </p>
                )}
                {activity.type === 'venue_invite' && (
                  <div className="text-white text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.display_name}</span>
                      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
                    </div>
                    <span className="text-[#d4ff00] block text-xs mt-0.5">@{activity.subtitle}</span>
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
                  <p className="text-white text-sm">
                    <span className="mr-1">⚡</span>
                    <span className="font-semibold text-[#d4ff00]">{activity.title.replace(' is trending', '')}</span>
                    <span className="text-white/70"> is trending · {activity.subtitle}</span>
                  </p>
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
                    I'm down! 🎉
                  </Button>
                )}

                {activity.type === 'venue_invite' && (
                  activity.isAtVenue ? (
                    <Button
                      onClick={() => handleOpenChat(activity)}
                      size="sm"
                      className="h-8 bg-[#d4ff00] hover:bg-[#d4ff00]/80 text-[#1a0f2e] rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(212,255,0,0.5)] hover:shadow-[0_0_16px_rgba(212,255,0,0.7)] transition-all"
                    >
                      Say hi! 👋
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleAcceptVenueInvite(activity)}
                      size="sm"
                      className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                    >
                      I'm down! 🎉
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

                {(activity.type === 'meet_up' || activity.type === 'trending') && (
                  <span className="bg-white/10 text-white/60 text-xs px-2 py-1 rounded-full">{getTimeAgo(activity.timestamp)}</span>
                )}
              </div>
            </div>
          </div>
        );

        const hasContent = invites.length > 0 || friendsOut.length > 0 || trending.length > 0;

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

            {/* Section 2: Friends Out Now */}
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

            {/* Section 3: Trending Now */}
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
          </div>
        ) : (
          <div className="text-center py-12">
            <MapPin className="h-16 w-16 mx-auto text-white/20 mb-4" />
            <p className="text-white/60">No recent activity</p>
            <p className="text-white/40 text-sm mt-2">Check in to see what your friends are up to</p>
          </div>
        );
      })()}
    </div>
  );
}
