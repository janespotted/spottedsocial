/**
 * Haptic feedback utility for mobile interactions
 * Falls back gracefully on devices that don't support vibration
 */
export const haptic = {
  /** Light tap - for likes, toggles */
  light: () => {
    try {
      navigator.vibrate?.(10);
    } catch {}
  },
  
  /** Medium tap - for selections, check-ins */
  medium: () => {
    try {
      navigator.vibrate?.(25);
    } catch {}
  },
  
  /** Heavy tap - for important actions */
  heavy: () => {
    try {
      navigator.vibrate?.(50);
    } catch {}
  },
  
  /** Success pattern - for completed actions like Meet Up sent */
  success: () => {
    try {
      navigator.vibrate?.([10, 50, 20]);
    } catch {}
  },
  
  /** Error pattern - for failed actions */
  error: () => {
    try {
      navigator.vibrate?.([50, 30, 50, 30, 50]);
    } catch {}
  }
};
