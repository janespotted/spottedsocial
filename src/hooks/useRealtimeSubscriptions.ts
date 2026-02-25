import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionConfig {
  onPostsChange?: () => void;
  onLikesChange?: () => void;
  // Incremental handlers for better performance
  onNewPost?: (payload: any) => void;
  onPostDeleted?: (payload: any) => void;
}

export function useRealtimeSubscriptions(config: SubscriptionConfig) {
  const { onPostsChange, onLikesChange, onNewPost, onPostDeleted } = config;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();

    if (!onPostsChange && !onLikesChange && !onNewPost && !onPostDeleted) {
      return;
    }

    const feedRealtimeChannel = supabase.channel('feed-realtime');

    if (onNewPost) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        onNewPost
      );
    } else if (onPostsChange) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        onPostsChange
      );
    }

    if (onPostDeleted) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'posts' },
        onPostDeleted
      );
    }

    if (onLikesChange) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_likes' },
        onLikesChange
      );
    }

    feedRealtimeChannel.subscribe();
    channelRef.current = feedRealtimeChannel;

    return cleanup;
  }, [onPostsChange, onLikesChange, onNewPost, onPostDeleted, cleanup]);

  return { cleanup };
}
