import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionConfig {
  onPostsChange?: () => void;
  onStoriesChange?: () => void;
  onLikesChange?: () => void;
  // Incremental handlers for better performance
  onNewPost?: (payload: any) => void;
  onPostDeleted?: (payload: any) => void;
}

export function useRealtimeSubscriptions(config: SubscriptionConfig) {
  const { onPostsChange, onStoriesChange, onLikesChange, onNewPost, onPostDeleted } = config;
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
    if (!onPostsChange && !onStoriesChange && !onLikesChange && !onNewPost && !onPostDeleted) {
      return;
    }

    // Single unified channel for all feed-related realtime updates
    const feedRealtimeChannel = supabase.channel('feed-realtime');

    // Posts: prefer incremental handlers if provided
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

    if (onStoriesChange) {
      feedRealtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories' },
        onStoriesChange
      );
    }

    // Likes are handled optimistically in handleLikePost, no need for realtime refetch
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
  }, [onPostsChange, onStoriesChange, onLikesChange, onNewPost, onPostDeleted, cleanup]);

  return { cleanup };
}
