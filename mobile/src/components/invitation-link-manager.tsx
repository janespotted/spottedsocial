import { useEffect, useRef } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useSession } from '@/hooks/use-session';
import { useDemoMode } from '@/lib/demo-mode';
import { claimInvitation, clearInvitation, subscribeInvitations } from '@/lib/invitation-links';

export function InvitationLinkManager() {
  const { session, onboardingResolved, onboardingNeeded } = useSession();
  const navigation = useRootNavigationState();
  const demo = useDemoMode();
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!session || demo) return;
    let cancelled = false;
    const owner = session.user.id;
    const open = async () => {
      try {
        const pending = await claimInvitation(owner);
        if (!pending || cancelled || !onboardingResolved || onboardingNeeded || !navigation?.key) return;
        const key = `${owner}:${pending.code}`;
        if (opened.current === key) return;
        opened.current = key;
        router.push({ pathname: '/invite-connect', params: { code: pending.code } } as never);
        await clearInvitation(pending.code, owner);
      } catch { /* A saved invitation can be retried after recovery or with its code. */ }
    };
    void open();
    const unsubscribe = subscribeInvitations(() => { opened.current = null; void open(); });
    return () => { cancelled = true; unsubscribe(); };
  }, [session?.user.id, demo, onboardingResolved, onboardingNeeded, navigation?.key]);
  return null;
}
