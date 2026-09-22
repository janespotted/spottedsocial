import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { findNearbyVenues } from '@/lib/location-service';
import { ARRIVAL_ACCURACY_M, type LocationFix } from '@/lib/location-quality';
import { goOutAtVenue, type OwnNightStatus } from '@/lib/night-status';
import { getCurrentPosition, startBackgroundLocation } from '@/lib/background-location';
import { dismissVenuePrompt, markToastShown } from '@/lib/venue-arrival-engine';
import { invalidateNightStatusQueries, useOwnNightStatus } from './use-own-night-status';
import { useSession } from './use-session';

export type MyNightStatus = OwnNightStatus;

export interface NearbyVenue {
  id: string;
  name: string;
}

interface PromptState {
  venue: NearbyVenue;
  coords: LocationFix;
  hasMultipleNearby: boolean;
}

/**
 * Foreground prompts for user-confirmed check-ins:
 * - planning + accurate GPS near a venue (100m) → smart prompt "Go live?"
 * - out without automatic updates + a different venue → venue-move banner
 * Automatic transitions use the server's dwell/accuracy checks instead.
 * Session-scoped dismissal per venue so neither prompt nags.
 */
export function useArrivalPrompts() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [smartPrompt, setSmartPrompt] = useState<PromptState | null>(null);
  const [moveBanner, setMoveBanner] = useState<PromptState | null>(null);
  const smartDismissed = useRef(new Set<string>());
  const moveDismissed = useRef(new Set<string>());

  // Shared status query; the independent one-minute timer below samples GPS
  // even when the fetched status has not changed.
  const { data: own } = useOwnNightStatus({ refetchInterval: 120_000 });
  const myStatus: MyNightStatus | null = own?.status ?? null;

  useEffect(() => {
    if (!session || !myStatus || (myStatus.status !== 'planning' && myStatus.status !== 'out') || myStatus?.is_private_party) {
      setSmartPrompt(null);
      setMoveBanner(null);
      return;
    }
    let cancelled = false;
    let busy = false;
    const check = async () => {
      if (cancelled || busy || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const pos = await getCurrentPosition();
        if (!pos || cancelled || pos.accuracy > ARRIVAL_ACCURACY_M) return;
        const rows = await findNearbyVenues(pos.lat, pos.lng, 100, 3);
        if (cancelled) return;
        const nearest = rows[0];
        if (!nearest) { setSmartPrompt(null); setMoveBanner(null); return; }
        const prompt: PromptState = {
          venue: { id: nearest.id, name: nearest.name }, coords: pos,
          hasMultipleNearby: rows.length > 1,
        };
        if (myStatus.status === 'planning' && !smartDismissed.current.has(nearest.id)) {
          setSmartPrompt(prompt);
        } else if (myStatus.status === 'out' && !myStatus.automatic_venue_updates &&
                   !myStatus.is_private_party && nearest.id !== myStatus.venue_id &&
                   !moveDismissed.current.has(nearest.id)) {
          setMoveBanner(prompt);
        } else { setMoveBanner(null); }
      } finally { busy = false; }
    };
    void check();
    // A real polling callback: unchanged query objects must not suppress GPS checks.
    const timer = setInterval(() => void check(), 60_000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    return () => { cancelled = true; clearInterval(timer); sub.remove(); };

  }, [session, myStatus]);

  const refresh = useCallback(() => invalidateNightStatusQueries(queryClient), [queryClient]);

  const acceptSmartPrompt = useCallback(async () => {
    if (!session || !smartPrompt) return;
    setSmartPrompt(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await goOutAtVenue(session.user.id, {
      venue: smartPrompt.venue,
      coords: smartPrompt.coords,
    });
    await startBackgroundLocation(session.user.id);
    refresh();
  }, [session, smartPrompt, refresh]);

  const dismissSmartPrompt = useCallback(() => {
    if (smartPrompt) smartDismissed.current.add(smartPrompt.venue.id);
    setSmartPrompt(null);
  }, [smartPrompt]);

  const acceptMove = useCallback(async () => {
    if (!session || !moveBanner) return;
    setMoveBanner(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await goOutAtVenue(session.user.id, {
      venue: moveBanner.venue,
      coords: moveBanner.coords,
    });
    await startBackgroundLocation(session.user.id);
    refresh();
  }, [session, moveBanner, refresh]);

  const dismissMove = useCallback(() => {
    if (moveBanner) {
      moveDismissed.current.add(moveBanner.venue.id);
      // Keep the background engine in sync so it doesn't re-nag via push
      dismissVenuePrompt(moveBanner.venue.id);
      markToastShown(moveBanner.venue.id);
    }
    setMoveBanner(null);
  }, [moveBanner]);

  return {
    myStatus: myStatus ?? null,
    smartPrompt,
    acceptSmartPrompt,
    dismissSmartPrompt,
    moveBanner,
    acceptMove,
    dismissMove,
  };
}
