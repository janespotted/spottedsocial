// Bootstrap mode configuration for hybrid demo/real data experience
// This mode is active until the app reaches critical mass

import type { SupportedCity } from './city-detection';
import { getCachedCity } from './city-detection';

export interface BootstrapConfig {
  enabled: boolean;
  thresholds: {
    totalUsers: number;
    dailyActive: number;
    venuesWithActivity: number;
  };
}

const BOOTSTRAP_CONFIG: BootstrapConfig = {
  enabled: true, // Toggle this to disable bootstrap mode
  thresholds: {
    totalUsers: 1000,      // Disable when you hit 1k users
    dailyActive: 100,      // Or 100 daily active users
    venuesWithActivity: 50 // Or 50 venues with real check-ins
  }
};

export function isBootstrapModeEnabled(): boolean {
  return BOOTSTRAP_CONFIG.enabled && getBootstrapMode().enabled;
}

interface BootstrapModeState {
  enabled: boolean;
  city: SupportedCity;
}

export function getBootstrapMode(): BootstrapModeState {
  try {
    const stored = localStorage.getItem('bootstrap_mode');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error reading bootstrap mode:', error);
  }
  
  // Default: bootstrap mode is ON with detected/cached city
  const city = getCachedCity() || 'nyc';
  return { enabled: true, city };
}

export function setBootstrapMode(enabled: boolean): void {
  const current = getBootstrapMode();
  const state: BootstrapModeState = { enabled, city: current.city };
  localStorage.setItem('bootstrap_mode', JSON.stringify(state));
  
  // Dispatch event for reactive components
  window.dispatchEvent(new CustomEvent('bootstrapModeChanged', { detail: state }));
}

export function shouldShowPromotedVenues(): boolean {
  return isBootstrapModeEnabled();
}
