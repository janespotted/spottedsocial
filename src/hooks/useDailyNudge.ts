import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type NudgeType = 'first' | 'second' | 'day' | null;

/**
 * Hook to handle daily nudge deep linking and modal state
 * 
 * When a user taps a push notification, they're directed to:
 * - /?nudge=first (for 4-6pm nudge)
 * - /?nudge=second (for 7:30pm nudge)
 * 
 * This hook parses the URL and triggers the appropriate modal
 */
export function useDailyNudge() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [nudgeType, setNudgeType] = useState<NudgeType>(null);

  // Check for nudge param on mount and when URL changes
  useEffect(() => {
    const nudgeParam = searchParams.get('nudge');
    
    if (nudgeParam === 'first' || nudgeParam === 'second' || nudgeParam === 'day') {
      setNudgeType(nudgeParam);
      setShowNudgeModal(true);
      
      // Clear the param from URL to prevent re-triggering on refresh
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('nudge');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const closeNudgeModal = useCallback(() => {
    setShowNudgeModal(false);
    setNudgeType(null);
  }, []);

  // Manual trigger for testing or scheduled local notifications
  const triggerNudge = useCallback((type: 'first' | 'second' | 'day') => {
    setNudgeType(type);
    setShowNudgeModal(true);
  }, []);

  return {
    showNudgeModal,
    nudgeType,
    closeNudgeModal,
    triggerNudge,
  };
}
