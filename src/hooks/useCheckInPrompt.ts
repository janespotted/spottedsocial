import { useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { isNightlifeHours } from '@/lib/time-context';

const PROMPT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_KEY = 'checkin_prompt_last_shown';

/**
 * Hook to handle automatic check-in prompts
 * - Prompts user every app open during nightlife hours (5pm - 5am)
 * - Won't re-prompt if shown within last 10 minutes
 * - Uses localStorage for persistence across sessions
 */
export function useCheckInPrompt() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();

  const checkAndPrompt = useCallback(() => {
    if (!user?.id) return;
    if (!isNightlifeHours()) return;

    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown && Date.now() - Number(lastShown) < PROMPT_COOLDOWN_MS) return;

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
