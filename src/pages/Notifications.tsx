import { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ArrowLeft, Bell, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { isFromTonight } from '@/lib/time-context';

interface SpottedActivity {
  id: string;
  user_id: string;
  venue_name: string;
  started_at: string;
  display_name: string;
  avatar_url: string | null;
}

export default function Notifications() {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spottedActivity, setSpottedActivity] = useState<SpottedActivity[]>([]);

  // Fetch friend check-ins as backfill when no notifications
  useEffect(() => {
    if (notifications.length > 0 || !user) return;

    const fetchSpotted = async () => {
      // Get friend IDs
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (!friendships?.length) return;

      const friendIds = friendships.map(f =>
        f.user_id === user.id ? f.friend_id : f.user_id
      );

      // Get recent check-ins from friends (tonight only)
      const { data: checkins } = await supabase
        .from('checkins')
        .select('id, user_id, venue_name, started_at')
        .in('user_id', friendIds)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(20);

      if (!checkins?.length) return;

      // Filter to tonight
      const tonightCheckins = checkins.filter(c => isFromTonight(c.started_at));
      if (!tonightCheckins.length) return;

      // Fetch profiles
      const userIds = [...new Set(tonightCheckins.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setSpottedActivity(
        tonightCheckins.map(c => ({
          ...c,
          display_name: profileMap.get(c.user_id)?.display_name || 'Someone',
          avatar_url: profileMap.get(c.user_id)?.avatar_url || null,
        }))
      );
    };

    fetchSpotted();
  }, [notifications.length, user]);

  const handleNotificationClick = (notificationId: string) => {
    markAsRead(notificationId);
  };

  const handleRefresh = useCallback(async () => {
    window.dispatchEvent(new Event('focus'));
    await new Promise(r => setTimeout(r, 500));
  }, []);

  const hasContent = notifications.length > 0 || spottedActivity.length > 0;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="max-w-[430px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-[#2d1b4e] flex items-center justify-center hover:bg-[#a855f7]/20 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">Notifications</h1>
          </div>
          {notifications.some(n => !n.is_read) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-sm text-[#d4ff00] hover:text-[#d4ff00]/80 hover:bg-[#a855f7]/10"
            >
              Mark all read
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[430px] mx-auto pb-24">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-[#2d1b4e] flex items-center justify-center mb-4">
              <Bell className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              All caught up
            </h3>
            <p className="text-white/50 text-sm max-w-xs">
              When friends interact with you, you'll see it here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#a855f7]/20">
            {/* Real notifications */}
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification.id)}
                className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-[#a855f7]/10 transition-colors ${
                  !notification.is_read ? 'bg-[#a855f7]/5' : ''
                }`}
              >
                <Avatar className="h-12 w-12 flex-shrink-0 border border-[#a855f7]/30">
                  <AvatarImage src={notification.sender_profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#a855f7] text-white">
                    {notification.sender_profile?.display_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-white ${!notification.is_read ? 'font-semibold' : ''}`}>
                    {notification.message}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!notification.is_read && (
                  <div className="w-2 h-2 rounded-full bg-[#d4ff00] flex-shrink-0 mt-2" />
                )}
              </div>
            ))}

            {/* Spotted activity backfill (only when no notifications) */}
            {notifications.length === 0 && spottedActivity.map((activity) => (
              <div
                key={activity.id}
                className="p-4 flex items-start gap-3 opacity-80"
              >
                <Avatar className="h-12 w-12 flex-shrink-0 border border-[#a855f7]/20">
                  <AvatarImage src={activity.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#2d1b4e] text-white">
                    {activity.display_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    <span className="font-semibold">{activity.display_name}</span>
                    {' '}spotted at{' '}
                    <span className="text-[#d4ff00]">{activity.venue_name}</span>
                  </p>
                  <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {formatDistanceToNow(new Date(activity.started_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
