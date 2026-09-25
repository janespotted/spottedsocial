import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/** Sensitive views reauthorize while visible; failed reads must not render old private data. */
export function usePrivateQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): UseQueryResult<TData, TError> {
  const result = useQuery({ ...options, staleTime: 0, refetchOnMount: 'always', refetchInterval: 15_000, retry: false, networkMode: 'always' });
  return { ...result, data: result.isError ? undefined : result.data } as UseQueryResult<TData, TError>;
}
