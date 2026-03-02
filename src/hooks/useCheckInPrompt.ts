import { useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { isNightlifeHours } from '@/lib/time-context';
import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'checkin_prompt_session';
const STORAGE_KEY = 'checkin_prompt_last_shown';
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

export function useCheckInPrompt() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();

  const checkAndPrompt = useCallback(async () => {
    if (!user?.id) return;
    if (!isNightlifeHours()) return;

    // Guard 1: localStorage 2-hour cooldown
    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown && Date.now() - Number(lastShown) < COOLDOWN_MS) return;

    // Guard 2: Skip if user already has active out/planning status
    try {
      const { data } = await supabase
        .from('night_statuses')
        .select('status, expires_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.status && data.status !== 'home' && data.expires_at && new Date(data.expires_at) > new Date()) {
        return;
      }
    } catch {
      // If query fails, continue to show prompt as fallback
    }

    // Guard 3: Only show once per session (tab lifetime)
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
