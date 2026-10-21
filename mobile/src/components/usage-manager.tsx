import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/use-session';
import { recordUsage } from '@/lib/usage';
export function UsageManager() {
  const { session, onboardingResolved, onboardingNeeded } = useSession();
  useEffect(() => {
    if (!session || !onboardingResolved || onboardingNeeded) return;
    void recordUsage('session_open');
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void recordUsage('session_open'); });
    return () => sub.remove();
  }, [session?.user.id, onboardingResolved, onboardingNeeded]);
  return null;
}
