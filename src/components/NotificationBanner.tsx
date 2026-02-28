import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, PartyPopper, MessageCircle } from 'lucide-react';

export function NotificationBanner() {
  const navigate = useNavigate();
  const { latestNotification, dismissLatest, markAsRead } = useNotifications();

  const supportedTypes = ['meetup_request', 'venue_invite', 'meetup_accepted', 'venue_invite_accepted', 'venue_yap'];

  useEffect(() => {
    if (latestNotification && supportedTypes.includes(latestNotification.type)) {
      const timer = setTimeout(() => {
        dismissLatest();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [latestNotification, dismissLatest]);

  if (!latestNotification || !supportedTypes.includes(latestNotification.type)) {
    return null;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAsRead(latestNotification.id);
    dismissLatest();
  };

  const handleBannerTap = () => {
    markAsRead(latestNotification.id);
    dismissLatest();
    navigate('/notifications');
  };

  const isAcceptedType = latestNotification.type === 'meetup_accepted' || latestNotification.type === 'venue_invite_accepted';
  const isYapType = latestNotification.type === 'venue_yap';

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[101] w-[90%] max-w-md animate-in fade-in slide-in-from-top-4 duration-300 cursor-pointer"
      onClick={handleBannerTap}
    >
      <div className={`rounded-2xl p-4 border ${
        isAcceptedType
          ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.6)] border-emerald-400/20'
          : isYapType
          ? 'bg-gradient-to-r from-amber-600 to-orange-500 shadow-[0_0_40px_rgba(245,158,11,0.6)] border-amber-400/20'
          : 'bg-gradient-to-r from-primary to-primary/80 shadow-[0_0_40px_rgba(124,58,237,0.6)] border-primary/20'
      }`}>
        <div className="flex items-center gap-3">
          {isAcceptedType ? (
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <PartyPopper className="h-6 w-6 text-white" />
            </div>
          ) : isYapType ? (
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
          ) : (
            <Avatar className="h-12 w-12 border-2 border-white">
              <AvatarImage src={latestNotification.sender_profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-background text-foreground">
                {latestNotification.sender_profile?.display_name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">
              {latestNotification.message}
            </p>
          </div>
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
