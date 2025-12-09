import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { isFromTonight, isNightlifeHours } from '@/lib/time-context';

/**
 * Hook to handle automatic check-in prompts
 * - Prompts user if they haven't set status tonight (using 5am rollover)
 * - Only auto-prompts during nightlife hours (5pm - 5am)
 * - Manual check-in button is always available
 */
export function useCheckInPrompt() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const hasPromptedRef = useRef(false);
  const isCheckingRef = useRef(false);

  const checkAndPrompt = useCallback(async () => {
    if (!user?.id || hasPromptedRef.current || isCheckingRef.current) return;
    
    // Only auto-prompt during nightlife hours
    if (!isNightlifeHours()) return;

    isCheckingRef.current = true;

    try {
      const { data } = await supabase
        .from('night_statuses')
        .select('updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      // Check if user has set status tonight (using 5am rollover)
      const hasCheckedTonight = data?.updated_at && isFromTonight(data.updated_at);

      if (!hasCheckedTonight) {
        hasPromptedRef.current = true;
        openCheckIn();
      }
    } catch (error) {
      console.error('Error checking night status:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [user?.id, openCheckIn]);

  // Run check on mount and when user changes
  useEffect(() => {
    if (user?.id) {
      // Small delay to let the page load first
      const timer = setTimeout(checkAndPrompt, 500);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkAndPrompt]);

  // Reset prompt flag when night changes (for users who stay logged in)
  useEffect(() => {
    const checkMidnightReset = () => {
      const hour = new Date().getHours();
      // Reset at 5am
      if (hour === 5) {
        hasPromptedRef.current = false;
      }
    };

    // Check every hour
    const interval = setInterval(checkMidnightReset, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { checkAndPrompt };
}
