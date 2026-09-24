import { useSyncExternalStore, type ReactNode } from 'react';
import { getSessionRevision, onSessionIdentityChange } from '@/lib/session-identity';
import { resetPostDetail } from '@/lib/post-detail';
import { clearAudienceRequest } from '@/lib/audience';
import { clearTagRequest } from '@/lib/tag-picker';
import { clearCountryRequest } from '@/lib/country-codes';
import { dismissToast } from '@/lib/toast';
import { invalidateOutStatusCache } from '@/lib/night-status';
import { setNightGateState, takePendingDeepLink } from '@/lib/night-gate';
import { resetMapFilters } from '@/lib/map-filters';
import { setActiveCity } from '@/lib/tonight';
import { resetDwellTracker } from '@/lib/venue-arrival-engine';
import { stopBackgroundLocation } from '@/lib/background-location';

onSessionIdentityChange(() => {
  resetPostDetail();
  clearAudienceRequest();
  clearTagRequest();
  clearCountryRequest();
  dismissToast();
  invalidateOutStatusCache();
  takePendingDeepLink();
  setNightGateState('unknown');
  resetMapFilters();
  setActiveCity(null);
  resetDwellTracker();
  void stopBackgroundLocation().catch(() => {});
});

function AccountTree({ children }: { children: ReactNode }) { return children; }

/** Remount hook-local state and native media when the account changes. */
export function AccountScope({ children }: { children: ReactNode }) {
  const revision = useSyncExternalStore(onSessionIdentityChange, getSessionRevision, getSessionRevision);
  return <AccountTree key={revision}>{children}</AccountTree>;
}
