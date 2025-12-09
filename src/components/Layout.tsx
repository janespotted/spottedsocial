import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { CheckInModal } from './CheckInModal';
import { OnboardingCarousel } from './OnboardingCarousel';
import { OfflineBanner } from './OfflineBanner';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCheckInPrompt } from '@/hooks/useCheckInPrompt';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showBrowserNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { showCheckIn, closeCheckIn, openCheckInFromReminder } = useCheckIn();
  const { unreadCount } = useNotifications();
  const { showOnboarding, completeOnboarding, loading: onboardingLoading } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Auto check-in prompt (runs after onboarding, during nightlife hours)
  useCheckInPrompt();
  
  // Map page needs full width and flex layout
  const isMapPage = location.pathname === '/map';

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
    <div className={cn(
      "min-h-[100dvh] bg-background flex flex-col",
      !isMapPage && "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]"
    )}>
      <OfflineBanner />
      <main className={cn(
        "flex-1 flex flex-col",
        isMapPage ? "w-full" : "max-w-[430px] mx-auto w-full"
      )}>
        {children}
      </main>
      <BottomNav />
      <CheckInModal open={showCheckIn} onOpenChange={closeCheckIn} />
    </div>
  );
}
