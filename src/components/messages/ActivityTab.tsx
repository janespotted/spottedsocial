import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, Zap, UserPlus, MessageSquare, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  type: 'check_in' | 'trending' | 'friend_request' | 'meet_up' | 'accepted_invite';
  title: string;
  subtitle?: string;
  timestamp: string;
  avatar_url?: string | null;
  user_id?: string;
  action?: 'meet_up' | 'view' | 'accept_decline' | 'message';
}

export function ActivityTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchActivities();
      fetchFriendRequests();
    }
  }, [user]);

  const fetchFriendRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id')
      .eq('friend_id', user?.id)
      .eq('status', 'pending');

    setFriendRequestCount(data?.length || 0);
  };

  const fetchActivities = async () => {
    // Fetch recent check-ins from friends
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    if (friendships) {
      const friendIds = friendships.map(f => f.friend_id);

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

      const activityList: Activity[] = [];

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
            action: 'meet_up',
          });
        });
      }

      // Add mock activities
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
        return <Zap className="h-8 w-8 text-[#d4ff00]" />;
      case 'friend_request':
        return <UserPlus className="h-6 w-6 text-[#d4ff00]" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Friend Requests */}
      <div
        onClick={() => navigate('/friend-requests')}
        className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#2d1b4e]/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#1a0f2e] border-2 border-[#a855f7] flex items-center justify-center">
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
          {friendRequestCount > 0 && <div className="bg-[#a855f7] rounded-full w-2 h-2" />}
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
            className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4"
          >
            <div className="flex items-center gap-3">
              {/* Icon/Avatar */}
              <div className="flex-shrink-0">
                {activity.avatar_url !== undefined ? (
                  <button
                    onClick={() => activity.user_id && openFriendCard(activity.user_id)}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="h-12 w-12 border-2 border-[#a855f7] cursor-pointer">
                      <AvatarImage src={activity.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {activity.title[0]}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#1a0f2e] border-2 border-[#a855f7] flex items-center justify-center">
                    {getActivityIcon(activity.type)}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-white">
                  {activity.title}
                  {activity.subtitle && (
                    <span className="font-bold text-white"> {activity.subtitle}</span>
                  )}
                </p>
                <p className="text-white/60 text-sm mt-0.5">{getTimeAgo(activity.timestamp)} ago</p>
              </div>

              {/* Action */}
              {activity.action === 'meet_up' && (
                <Button
                  variant="outline"
                  className="border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] rounded-full px-4 py-1"
                >
                  Meet Up
                </Button>
              )}
              {activity.action === 'view' && (
                <Button
                  variant="outline"
                  className="border-2 border-[#a855f7] bg-transparent text-[#a855f7] hover:bg-[#a855f7]/10 hover:text-[#a855f7] rounded-full px-4 py-1"
                >
                  View
                </Button>
              )}
              {activity.action === 'message' && (
                <button className="text-white hover:text-[#d4ff00] transition-colors">
                  <MessageSquare className="h-6 w-6" />
                </button>
              )}
              {activity.action === 'accept_decline' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] rounded-full px-4 py-1"
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    className="border-2 border-white/20 bg-transparent text-white/60 hover:bg-white/10 hover:text-white rounded-full px-4 py-1"
                  >
                    Decline
                  </Button>
                </div>
              )}
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
