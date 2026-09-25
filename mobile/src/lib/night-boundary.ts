import type { QueryClient } from '@tanstack/react-query';
import { invalidatePrivateViews } from './private-views';

/**
 * Everything that shows tonight's content and must be re-read the moment
 * the night rolls over (addendum v3 §4: "if the app is open at 5am, update
 * the UI without requiring a force quit"). The status keys live in
 * hooks/use-own-night-status.ts and are invalidated alongside these.
 */
type BoundaryListener = () => void;
const listeners = new Set<BoundaryListener>();

/**
 * Screens holding tonight's content in local state rather than react-query
 * (the DM thread's message list) subscribe here and re-fetch on the reset.
 */
export function onNightBoundary(listener: BoundaryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The 5 AM rollover, in one place. Invalidates every query that renders
 * expiring content, pushes the feed (which is plain state, not react-query)
 * and wakes local-state screens. Safe to call more than once.
 */
export function handleNightBoundary(queryClient: QueryClient): void {
  invalidatePrivateViews(queryClient);
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* one bad listener must not stop the rest */
    }
  }
}
