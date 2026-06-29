import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';

export type LocationPermissionState = 'granted' | 'while_using' | 'denied' | 'unknown';

/**
 * Monitors location permission state on native iOS.
 *
 * Returns:
 * - permissionState: current permission level
 * - showGate: whether to show the AlwaysOnGate (true on first post-onboarding
 *   launch where permission is not 'always', then periodically)
 * - dismissGate: callback to close the gate for this session
 * - isDegraded: whether location is denied (for persistent banner)
 */
export function useLocationPermission() {
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown');
  const [showGate, setShowGate] = useState(false);

  const checkPermission = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setPermissionState('granted');
      return;
    }

    try {
      const status = await Geolocation.checkPermissions();
      const loc = status.location; // 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

      if (loc === 'denied') {
        setPermissionState('denied');
      } else if (loc === 'granted') {
        // Capacitor doesn't distinguish between 'always' and 'while-using' at the JS level.
        // We check if background-geolocation is working by looking for the coarseLocation field
        // or by testing if the location key includes background.
        // For now, treat 'granted' as sufficient — the background-geolocation plugin
        // handles the actual distinction at runtime.
        setPermissionState('granted');
      } else {
        // 'prompt' — hasn't been asked yet (shouldn't happen post-onboarding)
        setPermissionState('unknown');
      }
    } catch {
      setPermissionState('unknown');
    }
  }, []);

  // Check on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // Re-check when app resumes (user may have changed permission in Settings)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: any;
    App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        checkPermission();
      }
    }).then(l => { listener = l; });

    return () => { listener?.remove?.(); };
  }, [checkPermission]);

  // Determine whether to show the gate
  useEffect(() => {
    if (permissionState === 'unknown') return;

    if (permissionState === 'denied') {
      // Show gate if not dismissed this session
      const sessionKey = `location_gate_dismissed_${new Date().toDateString()}`;
      if (!sessionStorage.getItem(sessionKey)) {
        setShowGate(true);
      }
    } else if (permissionState === 'granted') {
      setShowGate(false);
    }
  }, [permissionState]);

  const dismissGate = useCallback(() => {
    const sessionKey = `location_gate_dismissed_${new Date().toDateString()}`;
    sessionStorage.setItem(sessionKey, 'true');
    setShowGate(false);
  }, []);

  return {
    permissionState,
    showGate,
    dismissGate,
    isDegraded: permissionState === 'denied',
  };
}
