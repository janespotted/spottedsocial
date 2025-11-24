import { useEffect } from 'react';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X } from 'lucide-react';

export function NotificationBanner() {
  const { latestNotification, dismissLatest, markAsRead } = useNotifications();

  useEffect(() => {
    if (latestNotification && latestNotification.type === 'meetup_request') {
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        dismissLatest();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [latestNotification, dismissLatest]);

  if (!latestNotification || latestNotification.type !== 'meetup_request') {
    return null;
  }

  const handleDismiss = () => {
    markAsRead(latestNotification.id);
    dismissLatest();
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[101] w-[90%] max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-4 shadow-[0_0_40px_rgba(124,58,237,0.6)] border border-primary/20">
        <div className="flex items-center gap-3">
          {/* Sender Avatar */}
          <Avatar className="h-12 w-12 border-2 border-white">
            <AvatarImage src={latestNotification.sender_profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-background text-foreground">
              {latestNotification.sender_profile?.display_name?.[0] || '?'}
            </AvatarFallback>
          </Avatar>

          {/* Message */}
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">
              {latestNotification.message}
            </p>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
            aria-label="Dismiss notification"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
