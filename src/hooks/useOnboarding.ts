import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useOnboarding() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      checkOnboardingStatus();
    } else {
      setLoading(false);
    }
  }, [user]);

  const checkOnboardingStatus = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('has_onboarded')
        .eq('id', user?.id)
        .single();

      // Show onboarding if user hasn't completed it
      setShowOnboarding(data?.has_onboarded === false);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ has_onboarded: true })
        .eq('id', user?.id);

      if (error) {
        console.error('Error completing onboarding:', error);
        throw error;
      }

      setShowOnboarding(false);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      // Still hide onboarding on error to prevent user from being stuck
      setShowOnboarding(false);
      throw error;
    }
  };

  return {
    showOnboarding,
    loading,
    completeOnboarding,
  };
}
