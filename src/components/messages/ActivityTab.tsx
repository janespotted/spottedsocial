import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, Zap, UserPlus, MessageCircle, ChevronRight, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useUserCity } from '@/hooks/useUserCity';
import { getDemoUsersForCity, getPromotedVenuesForCity } from '@/lib/demo-data';
import { toast } from '@/hooks/use-toast';
import type { SupportedCity } from '@/lib/city-detection';

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
}

const generateDemoActivities = (city: SupportedCity): Activity[] => {
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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const demoEnabled = useDemoMode();
  const { city } = useUserCity();

  useEffect(() => {
    if (user) {
      fetchActivities();
      fetchFriendRequests();
    }
  }, [user, demoEnabled, city]);

  const fetchFriendRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id')
      .eq('friend_id', user?.id)
      .eq('status', 'pending');

    setFriendRequestCount(data?.length || 0);
  };

  const fetchActivities = async () => {
    // Fetch recent check-ins from friends (both directions)
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

    const activityList: Activity[] = [];

    if (friendIds.length > 0) {
      // Get recent check-ins
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

      if (checkIns) {
        checkIns.forEach(checkIn => {
          activityList.push({
            id: checkIn.id,
            type: 'check_in',
            title: `${checkIn.profiles?.display_name} arrived at the`,
            subtitle: checkIn.venue_name,
            timestamp: checkIn.created_at,
            avatar_url: checkIn.profiles?.avatar_url,
            user_id: checkIn.user_id,
            display_name: checkIn.profiles?.display_name,
            action: 'meet_up',
          });
        });
      }
    }

    // Add demo activities when demo mode is enabled
    if (demoEnabled) {
      const demoActivities = generateDemoActivities(city);
      activityList.push(...demoActivities);
    }

    // Add mock trending activity
    activityList.push({
      id: 'trending-1',
      type: 'trending',
      title: 'The Box is trending',
      subtitle: '12+ here now',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      action: 'view',
    });

    setActivities(activityList.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
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
    if (!user || !activity.user_id) return;

    // Get current user's display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const myName = profile?.display_name?.split(' ')[0] || 'Someone';

    // Send acceptance notification back
    if (!activity.user_id.startsWith('demo-')) {
      await supabase.from('notifications').insert({
        sender_id: user.id,
        receiver_id: activity.user_id,
        type: 'meetup_accepted',
        message: `${myName} is down to meet up! 🎉`,
      });
    }

    toast({
      title: "You're in! 🎉",
      description: `Let ${activity.display_name?.split(' ')[0]} know you're down`,
    });
  };

  const handleAcceptVenueInvite = async (activity: Activity) => {
    if (!user || !activity.user_id) return;

    // Get current user's display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const myName = profile?.display_name?.split(' ')[0] || 'Someone';

    // Send acceptance notification back
    if (!activity.user_id.startsWith('demo-')) {
      await supabase.from('notifications').insert({
        sender_id: user.id,
        receiver_id: activity.user_id,
        type: 'venue_invite_accepted',
        message: `${myName} is down for ${activity.subtitle}! 🎉`,
      });
    }

    toast({
      title: "You're in! 🎉",
      description: `Let ${activity.display_name?.split(' ')[0]} know you're down for ${activity.subtitle}`,
    });
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

  return (
    <div className="space-y-4">
      {/* Friend Requests */}
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

      {/* Activity Header */}
      <h2 className="text-2xl font-bold text-white">Activity</h2>

      {/* Activity List */}
      <div className="space-y-3">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className={`rounded-2xl p-4 transition-all hover:scale-[1.01] ${CARD_STYLE}`}
          >
            <div className="flex items-center gap-3">
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
                  <p className="text-white text-sm">
                    <span className="font-semibold">{activity.display_name}</span>
                    <span className="text-white/70"> invited you to </span>
                    <span className="font-semibold text-[#d4ff00]">{activity.subtitle}</span>
                  </p>
                )}
                {activity.type === 'check_in' && (
                  <p className="text-white text-sm">
                    <span className="font-semibold">{activity.display_name}</span>
                    <span className="text-white/70"> is at </span>
                    <span className="font-semibold text-[#d4ff00]">{activity.subtitle}</span>
                  </p>
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
                  <Button
                    onClick={() => handleAcceptVenueInvite(activity)}
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    I'm down! 🎉
                  </Button>
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
                    size="sm"
                    className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full px-4 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.5)] hover:shadow-[0_0_16px_rgba(168,85,247,0.7)] transition-all"
                  >
                    View
                  </Button>
                )}

                <span className="bg-white/10 text-white/60 text-xs px-2 py-1 rounded-full">{getTimeAgo(activity.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}

        {activities.length === 0 && (
          <div className="text-center py-12">
            <MapPin className="h-16 w-16 mx-auto text-white/20 mb-4" />
            <p className="text-white/60">No recent activity</p>
            <p className="text-white/40 text-sm mt-2">Check in to see what your friends are up to</p>
          </div>
        )}
      </div>
    </div>
  );
}
