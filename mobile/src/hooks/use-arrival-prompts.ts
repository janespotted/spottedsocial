import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { goOutAtVenue } from '@/lib/night-status';
import { getCurrentPosition, startBackgroundLocation } from '@/lib/background-location';
import { dismissVenuePrompt, markToastShown } from '@/lib/venue-arrival-engine';
import { useSession } from './use-session';

export interface MyNightStatus {
  status: string;
  venue_id: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
}

export interface NearbyVenue {
  id: string;
  name: string;
}

interface PromptState {
  venue: NearbyVenue;
  coords: { lat: number; lng: number };
  hasMultipleNearby: boolean;
}

/**
 * Simplified port of the web map's arrival prompts (the full dwell/cooldown
 * decision engine lands with the check-in flow):
 * - planning + GPS near a venue (200m)  → smart prompt "Go live?"
 * - out + GPS nearest venue ≠ current   → venue-move banner
 * Session-scoped dismissal per venue so neither prompt nags.
 */
export function useArrivalPrompts() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [smartPrompt, setSmartPrompt] = useState<PromptState | null>(null);
  const [moveBanner, setMoveBanner] = useState<PromptState | null>(null);
  const smartDismissed = useRef(new Set<string>());
  const moveDismissed = useRef(new Set<string>());

  const { data: myStatus } = useQuery({
    queryKey: ['my-night-status', session?.user.id],
    enabled: !!session,
    refetchInterval: 120_000,
    queryFn: async (): Promise<MyNightStatus | null> => {
      const { data } = await supabase
        .from('night_statuses')
        .select('status, venue_id, venue_name, lat, lng')
        .eq('user_id', session!.user.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (!session || !myStatus || (myStatus.status !== 'planning' && myStatus.status !== 'out')) {
      setSmartPrompt(null);
      setMoveBanner(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const pos = await getCurrentPosition();
      if (!pos || cancelled) return;
      const { data } = await (
        supabase.rpc as (fn: string, args: object) => PromiseLike<{ data: unknown }>
      )('find_nearest_venue', {
        user_lat: pos.lat,
        user_lng: pos.lng,
        radius_meters: 200,
      });
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ venue_id: string; venue_name: string }>;
      const nearest = rows[0];
      if (!nearest?.venue_id || !nearest.venue_name) return;
      const prompt: PromptState = {
        venue: { id: nearest.venue_id, name: nearest.venue_name },
        coords: pos,
        hasMultipleNearby: rows.length > 1,
      };
      if (myStatus.status === 'planning' && !smartDismissed.current.has(nearest.venue_id)) {
        setSmartPrompt(prompt);
      } else if (
        myStatus.status === 'out' &&
        nearest.venue_id !== myStatus.venue_id &&
        !moveDismissed.current.has(nearest.venue_id)
      ) {
        setMoveBanner(prompt);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, myStatus]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['my-night-status'] });
    queryClient.invalidateQueries({ queryKey: ['map-data'] });
  }, [queryClient]);

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
