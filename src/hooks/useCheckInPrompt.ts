import { useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { isNightlifeHours } from '@/lib/time-context';

const SESSION_KEY = 'checkin_prompt_session';
const STORAGE_KEY = 'checkin_prompt_last_shown';

/**
 * Hook to handle automatic check-in prompts
 * - Shows full modal only ONCE per session (browser tab lifetime)
 * - Uses sessionStorage to track if already shown this session
 * - Still respects 10-minute cooldown for edge cases (page reload)
 */
export function useCheckInPrompt() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();

  const checkAndPrompt = useCallback(() => {
    if (!user?.id) return;
    if (!isNightlifeHours()) return;

    // Only show once per session (tab lifetime)
    const shownThisSession = sessionStorage.getItem(SESSION_KEY);
    if (shownThisSession) return;

    sessionStorage.setItem(SESSION_KEY, 'true');
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    openCheckIn();
  }, [user?.id, openCheckIn]);

  useEffect(() => {
    if (user?.id) {
      const timer = setTimeout(checkAndPrompt, 500);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkAndPrompt]);

  return { checkAndPrompt };
}
