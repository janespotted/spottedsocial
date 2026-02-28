import { useCallback } from 'react';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ArrowLeft, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

export default function Notifications() {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notificationId: string) => {
    markAsRead(notificationId);
  };

  const handleRefresh = useCallback(async () => {
    // NotificationsContext fetches on mount; re-trigger by toggling
    window.dispatchEvent(new Event('focus'));
    await new Promise(r => setTimeout(r, 500));
  }, []);

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

      {/* Notifications List */}
      <div className="max-w-[430px] mx-auto pb-24">
        {notifications.length === 0 ? (
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
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification.id)}
                className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-[#a855f7]/10 transition-colors ${
                  !notification.is_read ? 'bg-[#a855f7]/5' : ''
                }`}
              >
                {/* Sender Avatar */}
                <Avatar className="h-12 w-12 flex-shrink-0 border border-[#a855f7]/30">
                  <AvatarImage src={notification.sender_profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#a855f7] text-white">
                    {notification.sender_profile?.display_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-white ${!notification.is_read ? 'font-semibold' : ''}`}>
                    {notification.message}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Unread Indicator */}
                {!notification.is_read && (
                  <div className="w-2 h-2 rounded-full bg-[#d4ff00] flex-shrink-0 mt-2" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
