import { isNativePlatform } from '@/lib/platform';

/**
 * Haptic feedback utility for mobile interactions.
 * Uses @capacitor/haptics on native iOS/Android, falls back to navigator.vibrate on web.
 */

let nativeHaptics: typeof import('@capacitor/haptics').Haptics | null = null;
let hapticsLoaded = false;

const loadNativeHaptics = async () => {
  if (hapticsLoaded) return nativeHaptics;
  hapticsLoaded = true;
  if (isNativePlatform()) {
    try {
      const mod = await import('@capacitor/haptics');
      nativeHaptics = mod.Haptics;
    } catch {}
  }
  return nativeHaptics;
};

// Pre-load on import
loadNativeHaptics();

export const haptic = {
  /** Light tap - for likes, toggles */
  light: async () => {
    const h = await loadNativeHaptics();
    if (h) {
      try { await h.impact({ style: 'light' as any }); } catch {}
    } else {
      try { navigator.vibrate?.(10); } catch {}
    }
  },
  
  /** Medium tap - for selections, check-ins */
  medium: async () => {
    const h = await loadNativeHaptics();
    if (h) {
      try { await h.impact({ style: 'medium' as any }); } catch {}
    } else {
      try { navigator.vibrate?.(25); } catch {}
    }
  },
  
  /** Heavy tap - for important actions */
  heavy: async () => {
    const h = await loadNativeHaptics();
    if (h) {
      try { await h.impact({ style: 'heavy' as any }); } catch {}
    } else {
      try { navigator.vibrate?.(50); } catch {}
    }
  },
  
  /** Success pattern - for completed actions */
  success: async () => {
    const h = await loadNativeHaptics();
    if (h) {
      try { await h.notification({ type: 'success' as any }); } catch {}
    } else {
      try { navigator.vibrate?.([10, 50, 20]); } catch {}
    }
  },
  
  /** Error pattern - for failed actions */
  error: async () => {
    const h = await loadNativeHaptics();
    if (h) {
      try { await h.notification({ type: 'error' as any }); } catch {}
    } else {
      try { navigator.vibrate?.([50, 30, 50, 30, 50]); } catch {}
    }
  }
};
