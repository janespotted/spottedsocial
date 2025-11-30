import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionConfig {
  onPostsChange?: () => void;
  onStoriesChange?: () => void;
  onLikesChange?: () => void;
}

export function useRealtimeSubscriptions(config: SubscriptionConfig) {
  const { onPostsChange, onStoriesChange, onLikesChange } = config;
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const cleanup = useCallback(() => {
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];
  }, []);

  useEffect(() => {
    // Clean up any existing channels first
    cleanup();

    if (onPostsChange) {
      const postsChannel = supabase
        .channel('realtime_posts')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'posts' },
          onPostsChange
        )
        .subscribe();
      channelsRef.current.push(postsChannel);
    }

    if (onStoriesChange) {
      const storiesChannel = supabase
        .channel('realtime_stories')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'stories' },
          onStoriesChange
        )
        .subscribe();
      channelsRef.current.push(storiesChannel);
    }

    if (onLikesChange) {
      const likesChannel = supabase
        .channel('realtime_likes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'post_likes' },
          onLikesChange
        )
        .subscribe();
      channelsRef.current.push(likesChannel);
    }

    return cleanup;
  }, [onPostsChange, onStoriesChange, onLikesChange, cleanup]);

  return { cleanup };
}
