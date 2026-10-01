import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/**
 * Query for a view that depends on who may see what. Revocation does not
 * come from polling: RLS answers every read, and lib/relationship-events
 * refetches these views the moment a relationship narrows. Callers keep
 * their own staleTime; a failed refetch keeps the last authorized result
 * on screen (a network blip is not a revocation).
 */
export function usePrivateQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): UseQueryResult<TData, TError> {
  return useQuery(options);
}
