import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { setDemoMode } from '@/lib/demo-data';
import { cacheCity } from '@/lib/city-detection';
import type { SupportedCity } from '@/lib/city-detection';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

const PENDING_DEMO_KEY = 'pending_demo_activation';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PendingDemoActivation {
  city: SupportedCity;
  timestamp: number;
}

export function DemoActivator() {
  const { user, loading } = useAuth();
  const hasActivated = useRef(false);

  // Step 1: Detect URL params on mount (before auth)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demoParam = params.get('demo');
    const cityParam = params.get('city') as SupportedCity | null;

    if (demoParam === 'yc' || demoParam === 'true') {
      const activation: PendingDemoActivation = {
        city: cityParam || 'nyc',
        timestamp: Date.now()
      };
      
      localStorage.setItem(PENDING_DEMO_KEY, JSON.stringify(activation));
      logger.debug('demo:url-detected', { city: activation.city });
      
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Step 2: Activate demo after auth
  useEffect(() => {
    if (loading || !user || hasActivated.current) return;

    const stored = localStorage.getItem(PENDING_DEMO_KEY);
    if (!stored) return;

    try {
      const pending: PendingDemoActivation = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() - pending.timestamp > EXPIRY_MS) {
        localStorage.removeItem(PENDING_DEMO_KEY);
        logger.debug('demo:activation-expired');
        return;
      }

      hasActivated.current = true;
      activateDemo(pending.city, user.id);
    } catch (e) {
      localStorage.removeItem(PENDING_DEMO_KEY);
    }
  }, [user, loading]);

  return null;
}

async function activateDemo(city: SupportedCity, userId: string) {
  try {
    logger.debug('demo:activating', { city, userId });

    // Enable demo mode
    setDemoMode(true);
    
    // Set city
    cacheCity(city);

    // Seed data via edge function
    const { error } = await supabase.functions.invoke('seed-demo-data', {
      body: { action: 'seed', city, userId }
    });

    if (error) {
      logger.error('demo:seed-error', { error: error.message });
      toast.error('Failed to load demo data');
      return;
    }

    // Clear pending activation
    localStorage.removeItem(PENDING_DEMO_KEY);

    // Dispatch event to notify other components
    window.dispatchEvent(new Event('demoModeChanged'));

    // Show success toast
    const cityName = city === 'nyc' ? 'NYC' : city === 'la' ? 'LA' : 'Palm Beach';
    toast.success(`Welcome! Demo mode activated with ${cityName} nightlife data 🎉`);

    logger.debug('demo:activated', { city });
  } catch (e) {
    logger.error('demo:activation-failed', { error: String(e) });
    toast.error('Failed to activate demo mode');
  }
}
