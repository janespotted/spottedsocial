import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionConfig {
  onPostsChange?: () => void;
  onStoriesChange?: () => void;
  onLikesChange?: () => void;
}

export function useRealtimeSubscriptions(config: SubscriptionConfig) {
  const { onPostsChange, onStoriesChange, onLikesChange } = config;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Clean up any existing channel first
    cleanup();

    // Only create channel if at least one callback is provided
    if (!onPostsChange && !onStoriesChange && !onLikesChange) {
      return;
    }

    // Single unified channel for all feed-related realtime updates
    const feedRealtimeChannel = supabase.channel('feed-realtime');

    if (onPostsChange) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        onPostsChange
      );
    }

    if (onStoriesChange) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories' },
        onStoriesChange
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
  }, [onPostsChange, onStoriesChange, onLikesChange, cleanup]);

  return { cleanup };
}
