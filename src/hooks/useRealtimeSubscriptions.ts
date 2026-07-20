import { useEffect, useRef, useCallback } from 'react';
import { createResilientChannel } from '@/lib/resilient-channel';

interface SubscriptionConfig {
  onPostsChange?: () => void;
  onLikesChange?: () => void;
  onNightStatusChange?: () => void;
  // Incremental handlers for better performance
  onNewPost?: (payload: any) => void;
  onPostDeleted?: (payload: any) => void;
}

export function useRealtimeSubscriptions(config: SubscriptionConfig) {
  const { onPostsChange, onLikesChange, onNightStatusChange, onNewPost, onPostDeleted } = config;
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => {
    cleanup();

    if (!onPostsChange && !onLikesChange && !onNightStatusChange && !onNewPost && !onPostDeleted) {
      return;
    }

    cleanupRef.current = createResilientChannel({
      name: 'feed-realtime',
      configure: (ch) => {
        if (onNewPost) {
          ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, onNewPost);
        } else if (onPostsChange) {
          ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, onPostsChange);
        }

        if (onPostDeleted) {
          ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, onPostDeleted);
        }

        if (onLikesChange) {
          ch.on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, onLikesChange);
        }

        if (onNightStatusChange) {
          ch.on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, onNightStatusChange);
        }

        return ch;
      },
      onReconnect: () => {
        // Refetch all data streams on reconnect
        onPostsChange?.();
        onLikesChange?.();
        onNightStatusChange?.();
      },
    });

    return cleanup;
  }, [onPostsChange, onLikesChange, onNightStatusChange, onNewPost, onPostDeleted, cleanup]);

  return { cleanup };
}
