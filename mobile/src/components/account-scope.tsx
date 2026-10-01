import { useSyncExternalStore, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { getSessionRevision, getSessionUserId, onSessionIdentityChange } from '@/lib/session-identity';
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

// Media is disk-cached by storage path for speed. When an account signs out
// or another one signs in, the previous account's photos and posters must
// not be served to the next one, so the image caches are emptied. App launch
// (no previous account) keeps the cache — that is what makes the feed instant.
let previousUserId: string | null = null;
onSessionIdentityChange(() => {
  if (previousUserId) {
    Image.clearMemoryCache().catch(() => {});
    Image.clearDiskCache().catch(() => {});
  }
  previousUserId = getSessionUserId();
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
