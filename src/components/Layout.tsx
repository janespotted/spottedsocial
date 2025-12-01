import { ReactNode, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { CheckInModal } from './CheckInModal';
import { OnboardingCarousel } from './OnboardingCarousel';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showBrowserNotification } from '@/lib/notifications';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { showCheckIn, closeCheckIn, openCheckInFromReminder } = useCheckIn();
  const { unreadCount } = useNotifications();
  const { showOnboarding, completeOnboarding, loading: onboardingLoading } = useOnboarding();
  const navigate = useNavigate();

  // Check for pending check-in reminders
  useEffect(() => {
    const checkReminder = () => {
      const reminderTime = localStorage.getItem('checkin_reminder');
      if (reminderTime && Date.now() >= Number(reminderTime)) {
        localStorage.removeItem('checkin_reminder');
        
        // Show browser notification
        showBrowserNotification(
          'Have you made up your mind?',
          'Are you going out tonight? Tap to let your friends know!'
        );
        
        openCheckInFromReminder();
      }
    };
    
    // Check immediately on mount
    checkReminder();
    
    // Check every 30 seconds
    const interval = setInterval(checkReminder, 30000);
    
    return () => clearInterval(interval);
  }, [openCheckInFromReminder]);

  // Show onboarding for new users
  if (!onboardingLoading && showOnboarding) {
    return <OnboardingCarousel onComplete={completeOnboarding} />;
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Notifications Button */}
      <button
        onClick={() => navigate('/notifications')}
        className="fixed top-4 right-4 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all"
        aria-label="View notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      <main className="max-w-[430px] mx-auto">
        {children}
      </main>
      <BottomNav />
      <CheckInModal open={showCheckIn} onOpenChange={closeCheckIn} />
    </div>
  );
}
