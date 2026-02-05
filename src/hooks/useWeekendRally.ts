import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook to handle weekend rally deep linking and state
 * 
 * When a user taps the Thursday "What's the move this weekend?" push notification,
 * they're directed to /?rally=weekend which triggers the weekend filter mode
 */
export function useWeekendRally() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isWeekendRally, setIsWeekendRally] = useState(false);

  // Check for rally param on mount and when URL changes
  useEffect(() => {
    const rallyParam = searchParams.get('rally');
    
    if (rallyParam === 'weekend') {
      setIsWeekendRally(true);
      
      // Clear the param from URL to prevent re-triggering on refresh
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('rally');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const clearRally = useCallback(() => {
    setIsWeekendRally(false);
  }, []);

  // Manual trigger for testing or internal navigation
  const triggerRally = useCallback(() => {
    setIsWeekendRally(true);
  }, []);

  return {
    isWeekendRally,
    clearRally,
    triggerRally,
  };
}

/**
 * Get the weekend date range (Friday-Sunday)
 * If it's already weekend, returns this weekend
 * If it's Mon-Thu, returns next weekend
 */
export function getWeekendDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  let fridayOffset: number;
  
  if (dayOfWeek === 0) {
    // Sunday - show this weekend (today is part of it)
    fridayOffset = -2;
  } else if (dayOfWeek === 6) {
    // Saturday - show this weekend
    fridayOffset = -1;
  } else if (dayOfWeek === 5) {
    // Friday - show this weekend
    fridayOffset = 0;
  } else {
    // Mon-Thu - show upcoming weekend
    fridayOffset = 5 - dayOfWeek;
  }
  
  const friday = new Date(now);
  friday.setDate(now.getDate() + fridayOffset);
  friday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: friday, end: sunday };
}

/**
 * Check if a date falls within the weekend range
 */
export function isWeekendDate(dateString: string): boolean {
  const { start, end } = getWeekendDateRange();
  const date = new Date(dateString);
  return date >= start && date <= end;
}
