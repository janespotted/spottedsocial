import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { CheckInModal } from './CheckInModal';
import { CheckInConfirmation } from './CheckInConfirmation';
import { OnboardingCarousel } from './OnboardingCarousel';
import { OfflineBanner } from './OfflineBanner';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCheckInPrompt } from '@/hooks/useCheckInPrompt';
import { useVenueArrivalNudge } from '@/hooks/useVenueArrivalNudge';
import { useYapNotifications } from '@/hooks/useYapNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showBrowserNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { performAutoCheckout } from '@/lib/auto-checkout';
import { toast } from 'sonner';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { showCheckIn, closeCheckIn, openCheckInFromReminder, openCheckInForVenueArrival } = useCheckIn();
  const { unreadCount } = useNotifications();
  const { showOnboarding, completeOnboarding, loading: onboardingLoading } = useOnboarding();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Auto check-in prompt (runs after onboarding, during nightlife hours)
  useCheckInPrompt();
  
  // Venue arrival detection (runs on all pages)
  useVenueArrivalNudge();
  
  // Yap notifications at user's current venue
  useYapNotifications();
  
  // Map page needs full width and flex layout
  const isMapPage = location.pathname === '/map';

  // Check for venue correction prompt (set by auto-venue-tracker notification tap)
  // Runs on mount and on app resume (visibilitychange) so it catches native notification taps
  useEffect(() => {
    const checkVenueFlags = () => {
      if (localStorage.getItem('venue_correction_prompt') === 'true') {
        localStorage.removeItem('venue_correction_prompt');
        openCheckInFromReminder();
        return;
      }

      // Venue arrival while planning — open check-in at privacy selection with pre-populated venue
      if (localStorage.getItem('venue_arrival_planning_open') === 'true') {
        localStorage.removeItem('venue_arrival_planning_open');
        try {
          const raw = localStorage.getItem('venue_arrival_planning_payload');
          if (raw) {
            const { venue_id, venue_name } = JSON.parse(raw);
            localStorage.removeItem('venue_arrival_planning_payload');
            if (venue_id && venue_name) {
              openCheckInForVenueArrival(venue_id, venue_name);
              return;
            }
          }
        } catch {
          // Malformed JSON — fall through to normal check-in
        }
        openCheckInFromReminder();
      }
    };
    checkVenueFlags();
    const onVisibilityChange = () => {
      if (!document.hidden) checkVenueFlags();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [openCheckInFromReminder, openCheckInForVenueArrival]);

  // Check for pending check-in reminders + still-here nudge
  useEffect(() => {
    const checkReminder = () => {
      // Original check-in reminder
      const reminderTime = localStorage.getItem('checkin_reminder');
      if (reminderTime && Date.now() >= Number(reminderTime)) {
        localStorage.removeItem('checkin_reminder');
        showBrowserNotification(
          'Have you made up your mind?',
          'Are you going out tonight? Tap to let your friends know!'
        );
        openCheckInFromReminder();
      }

      // "Still here?" nudge timer
      const stillHereTime = localStorage.getItem('still_here_check');
      if (stillHereTime && Date.now() >= Number(stillHereTime)) {
        const venueName = localStorage.getItem('still_here_venue') || 'your spot';
        localStorage.removeItem('still_here_check');

        // Set a 30-minute auto-checkout deadline
        if (!localStorage.getItem('still_here_deadline')) {
          localStorage.setItem('still_here_deadline', String(Date.now() + 30 * 60 * 1000));
        }

        showBrowserNotification(
          `Still at ${venueName}?`,
          'Tap to confirm or head home'
        );

        // Show in-app toast with actions
        if (user) {
          toast.custom((id) => (
            <div className="w-full bg-[#1a0f2e] border border-[#a855f7]/40 rounded-2xl p-4 shadow-xl">
              <p className="text-white font-semibold text-sm mb-1">Still at {venueName}?</p>
              <p className="text-white/50 text-xs mb-3">Let your friends know what you're up to</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    toast.dismiss(id);
                    const now = new Date().toISOString();
                    await Promise.all([
                      supabase.from('profiles').update({ last_location_at: now }).eq('id', user.id),
                      supabase.from('checkins').update({ last_updated_at: now }).eq('user_id', user.id).is('ended_at', null),
                    ]);
                    localStorage.removeItem('still_here_deadline');
                    localStorage.setItem('still_here_check', String(Date.now() + 2 * 60 * 60 * 1000));
                    localStorage.setItem('still_here_venue', venueName);
                  }}
                  className="w-full h-10 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Yes, still here
                </button>
                <button
                  onClick={() => {
                    toast.dismiss(id);
                    localStorage.removeItem('still_here_deadline');
                    localStorage.removeItem('still_here_venue');
                    localStorage.removeItem('still_here_check');
                    openCheckInFromReminder();
                  }}
                  className="w-full h-10 bg-[#2d1b4e] hover:bg-[#2d1b4e]/80 text-[#d4ff00] text-sm font-medium rounded-xl border border-[#d4ff00]/30 transition-colors"
                >
                  I'm at a new spot
                </button>
                <button
                  onClick={async () => {
                    toast.dismiss(id);
                    if (user) {
                      await performAutoCheckout(user.id, 'still_here_heading_home');
                      localStorage.removeItem('still_here_deadline');
                      localStorage.removeItem('still_here_venue');
                    }
                  }}
                  className="w-full h-9 text-white/50 hover:text-white text-sm transition-colors"
                >
                  Heading home
                </button>
              </div>
            </div>
          ), { duration: 60000 });
        }
      }

      // Auto-checkout deadline (30 min after nudge with no response)
      const deadline = localStorage.getItem('still_here_deadline');
      if (deadline && Date.now() >= Number(deadline) && user) {
        localStorage.removeItem('still_here_deadline');
        localStorage.removeItem('still_here_venue');
        localStorage.removeItem('still_here_check');
        performAutoCheckout(user.id, 'still_here_no_response');
      }
    };
    
    checkReminder();
    const interval = setInterval(checkReminder, 30000);
    return () => clearInterval(interval);
  }, [openCheckInFromReminder, user]);

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
      <CheckInConfirmation />
    </div>
  );
}
