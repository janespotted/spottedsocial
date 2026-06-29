import { ReactNode, useEffect, useState } from 'react';
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
import { useNavigate } from 'react-router-dom';
import { showBrowserNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { performAutoCheckout } from '@/lib/auto-checkout';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useLocationPermission } from '@/hooks/useLocationPermission';
import { AlwaysOnGate } from './AlwaysOnGate';
import { LocationDegradedBanner } from './LocationDegradedBanner';
import { PlanInviteModal } from './PlanInviteModal';
import { toast } from 'sonner';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { showCheckIn, closeCheckIn, openCheckInFromReminder, openCheckInForVenueArrival, openCheckInNewSpot } = useCheckIn();
  const { unreadCount } = useNotifications();
  const { showOnboarding, completeOnboarding, loading: onboardingLoading } = useOnboarding();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isMapPage = location.pathname === '/map';
  const { showGate, dismissGate, isDegraded, permissionState } = useLocationPermission();

  // Plan invite modal state
  const [planInvite, setPlanInvite] = useState<{
    planId: string;
    inviterName: string;
    inviterAvatarUrl: string | null;
    venueName: string;
    planDate: string;
    planTime: string;
  } | null>(null);

  // Check for pending plan invites on mount and app resume
  useEffect(() => {
    if (!user) return;

    const checkPlanInvites = async () => {
      const { data: invites } = await supabase
        .from('notifications')
        .select('id, message, sender_id, created_at')
        .eq('receiver_id', user.id)
        .eq('type', 'plan_invite')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!invites?.length) return;
      const invite = invites[0];

      // Get sender profile
      const allProfiles: any[] = (await supabase.rpc('get_profiles_safe')).data || [];
      const sender = allProfiles.find((p: any) => p.id === invite.sender_id);
      if (!sender) return;

      // Find the plan this invite is for
      const { data: participations } = await supabase
        .from('plan_participants')
        .select('plan_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!participations?.length) return;

      const planIds = participations.map(p => p.plan_id);
      const { data: plans } = await supabase
        .from('plans')
        .select('id, venue_name, plan_date, plan_time, user_id')
        .in('id', planIds)
        .eq('user_id', invite.sender_id)
        .gte('expires_at', new Date().toISOString())
        .limit(1);

      if (!plans?.length) return;
      const plan = plans[0];

      setPlanInvite({
        planId: plan.id,
        inviterName: sender.display_name,
        inviterAvatarUrl: sender.avatar_url,
        venueName: plan.venue_name,
        planDate: plan.plan_date,
        planTime: plan.plan_time,
      });

      // Mark notification as read
      await supabase.from('notifications').update({ is_read: true }).eq('id', invite.id);
    };

    // Small delay so it doesn't block initial render
    const timer = setTimeout(checkPlanInvites, 2000);

    const onVisibility = () => {
      if (!document.hidden) setTimeout(checkPlanInvites, 500);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  // Scroll to top on tab change
  useEffect(() => {
    const main = document.getElementById('main-scroll');
    if (main) main.scrollTop = 0;
  }, [location.pathname]);

  // DEBUG: runtime layout measurements on leaderboard
  useEffect(() => {
    if (location.pathname !== '/leaderboard') return;
    const timer = setTimeout(() => {
      const main = document.getElementById('main-scroll');
      const layoutDiv = main?.parentElement;
      const nav = document.querySelector('nav.fixed');
      if (main) {
        const cs = getComputedStyle(main);
        const rect = main.getBoundingClientRect();
        console.log('[DEBUG layout] main#main-scroll', {
          computedHeight: cs.height,
          computedPaddingBottom: cs.paddingBottom,
          boundingRect: { top: rect.top, bottom: rect.bottom, height: rect.height },
          scrollHeight: main.scrollHeight,
          clientHeight: main.clientHeight,
          overflowY: cs.overflowY,
        });
      }
      if (layoutDiv) {
        const cs = getComputedStyle(layoutDiv);
        const rect = layoutDiv.getBoundingClientRect();
        console.log('[DEBUG layout] Layout outer div', {
          computedHeight: cs.height,
          computedPaddingBottom: cs.paddingBottom,
          boundingRect: { top: rect.top, bottom: rect.bottom, height: rect.height },
          overflowY: cs.overflowY,
          className: layoutDiv.className,
        });
      }
      if (nav) {
        const rect = nav.getBoundingClientRect();
        console.log('[DEBUG layout] BottomNav', {
          boundingRect: { top: rect.top, bottom: rect.bottom, height: rect.height },
        });
      }
      // Check if leaderboard items are inside main
      const items = document.querySelectorAll('[data-leaderboard-item]');
      if (items.length === 0) {
        const allDivs = main?.querySelectorAll('div');
        console.log('[DEBUG layout] No [data-leaderboard-item] found. main has', allDivs?.length, 'child divs');
        // Check if main contains the visible leaderboard content
        const h2 = main?.querySelector('h1, h2, [class*="Leaderboard"]');
        console.log('[DEBUG layout] Leaderboard heading inside main?', !!h2, h2?.textContent?.slice(0, 30));
      } else {
        const firstItem = items[0];
        console.log('[DEBUG layout] First leaderboard item inside main?', main?.contains(firstItem));
      }
      console.log('[DEBUG layout] isMapPage=', location.pathname === '/map', 'pathname=', location.pathname);
      console.log('[DEBUG layout] pb class applied?', !!(location.pathname !== '/map'), '→ pb-[calc(4rem+env(safe-area-inset-bottom,0px))]');
      // Check window dimensions
      console.log('[DEBUG layout] window', { innerHeight: window.innerHeight, innerWidth: window.innerWidth, dvh: CSS.supports('height', '100dvh') });
    }, 1500);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Input scroll handled by Capacitor's resize: 'native' — no manual scrollIntoView needed

  // Keep profiles cache warm so all pages can read via getQueryData
  useProfilesSafe();

  // Auto check-in prompt (runs after onboarding, during nightlife hours)
  useCheckInPrompt();
  
  // Venue arrival detection (runs on all pages)
  useVenueArrivalNudge();
  
  // Yap notifications at user's current venue
  useYapNotifications();
  
  // Location permission is now handled by useLocationPermission hook + AlwaysOnGate

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
    const checkReminder = async () => {
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
      if (stillHereTime && Date.now() >= Number(stillHereTime) && user) {
        // Check if user still has an active (non-expired) night status
        const { data: activeStatus } = await supabase
          .from('night_statuses')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'out')
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (!activeStatus) {
          // No active status — stale timer from a previous night, clean up
          localStorage.removeItem('still_here_check');
          localStorage.removeItem('still_here_venue');
          localStorage.removeItem('still_here_deadline');
          return;
        }

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

        // Show in-app toast with actions (use fixed ID to prevent duplicates)
        if (user) {
          toast.dismiss('still-here-nudge');
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
                    openCheckInNewSpot();
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
          ), { duration: 60000, id: 'still-here-nudge' });
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
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <OfflineBanner />
      {isDegraded && <LocationDegradedBanner />}
      {showGate && !showOnboarding && (
        <AlwaysOnGate
          permissionState={permissionState === 'denied' ? 'denied' : 'while_using'}
          onDismiss={dismissGate}
        />
      )}
      <main
        id="main-scroll"
        key={location.pathname}
        className={cn(
          "flex-1 flex flex-col page-enter overflow-y-auto overflow-x-hidden overscroll-contain",
          isMapPage ? "w-full" : "max-w-[430px] mx-auto w-full"
        )}
        style={isMapPage ? undefined : { paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>
      <BottomNav />
      <CheckInModal open={showCheckIn} onOpenChange={closeCheckIn} />
      <CheckInConfirmation />
      <PlanInviteModal
        open={!!planInvite}
        invite={planInvite}
        onClose={() => setPlanInvite(null)}
      />
    </div>
  );
}
