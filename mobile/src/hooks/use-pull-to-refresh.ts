import { useCallback, useState } from 'react';

/**
 * Spinner state for a RefreshControl that belongs to the pull gesture only.
 * react-query's `isRefetching` is the wrong source: realtime invalidations
 * refetch in the background and would spin a wheel nobody pulled — which
 * on a busy night looks like the "refresh loop" from QA (addendum v3 §8.1).
 * One pull = one refresh; overlapping pulls are ignored.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refreshing]);
  return { refreshing, onRefresh };
}
