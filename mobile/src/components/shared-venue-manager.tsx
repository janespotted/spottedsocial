import { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useSession } from '@/hooks/use-session';
import { consumeSharedVenue, subscribeSharedVenue } from '@/lib/venue-links';
import { deferDeepLink, getNightGateState } from '@/lib/night-gate';
/** Preserve the selected public venue through sign-in and mandatory onboarding. */
export function SharedVenueManager() {
  const { session, onboardingResolved, onboardingNeeded } = useSession();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!session || !onboardingResolved || onboardingNeeded || !navigation?.key) return;
    let cancelled = false;
    const open = () => consumeSharedVenue(id => {
      if (cancelled) return false;
      const target = { pathname: '/venue' as const, params: { venueId: id } };
      if (getNightGateState() !== 'answered') deferDeepLink(target);
      else router.push(target);
      return true;
    }).catch(() => { /* Keep a failed handoff saved for the next mount. */ });
    void open();
    const unsubscribe = subscribeSharedVenue(() => void open());
    return () => { cancelled = true; unsubscribe(); };
  }, [session?.user.id, onboardingResolved, onboardingNeeded, navigation?.key]);
  return null;
}
