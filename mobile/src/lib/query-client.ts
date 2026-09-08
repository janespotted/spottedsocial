import { QueryClient } from '@tanstack/react-query';

/** Shared instance so non-hook code (e.g. moderation actions) can invalidate. */
export const queryClient = new QueryClient();
