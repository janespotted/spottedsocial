import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { isNightlifeHours } from '@/lib/time-context';
import { supabase } from '@/integrations/supabase/client';
import { isNativePlatform } from '@/lib/platform';

const STORAGE_KEY = 'checkin_prompt_last_shown';
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

export function useCheckInPrompt() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const promptingRef = useRef(false);

  const checkAndPrompt = useCallback(async () => {
    if (!user?.id) return;
    if (!isNightlifeHours()) return;
    if (promptingRef.current) return;

    // Guard: localStorage 2-hour cooldown
    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown && Date.now() - Number(lastShown) < COOLDOWN_MS) return;

    // Guard: Skip if user already has active out/planning status
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

    promptingRef.current = true;
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    openCheckIn();

    // Reset after a short delay so future resumes can re-trigger
    setTimeout(() => { promptingRef.current = false; }, 3000);
  }, [user?.id, openCheckIn]);

  // Initial mount trigger
  useEffect(() => {
    if (user?.id) {
      const timer = setTimeout(checkAndPrompt, 500);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkAndPrompt]);

  // Re-trigger on app resume (iOS Capacitor + web tab switch)
  useEffect(() => {
    if (!user?.id) return;

    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let Capacitor webview settle
        setTimeout(checkAndPrompt, 800);
      }
    };

    document.addEventListener('visibilitychange', handleResume);

    // Capacitor native app state listener
    let removeNativeListener: (() => void) | null = null;
    if (isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            setTimeout(checkAndPrompt, 800);
          }
        }).then(handle => {
          removeNativeListener = () => handle.remove();
        });
      }).catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      removeNativeListener?.();
    };
  }, [user?.id, checkAndPrompt]);

  return { checkAndPrompt };
}
