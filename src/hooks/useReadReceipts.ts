import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  created_at: string;
  sender_id: string;
}

export function useReadReceipts(
  threadId: string | undefined,
  userId: string | undefined,
  messages: Message[],
  enabled: boolean = true
) {
  const [readReceipts, setReadReceipts] = useState<Map<string, Date>>(new Map());
  const lastMarkRef = useRef(0);

  const markAsRead = useCallback(async () => {
    if (!threadId || !userId || !enabled) return;
    const now = Date.now();
    if (now - lastMarkRef.current < 2000) return;
    lastMarkRef.current = now;

    await supabase
      .from('dm_read_receipts' as any)
      .upsert({
        thread_id: threadId,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      } as any);
  }, [threadId, userId, enabled]);

  const fetchReceipts = useCallback(async () => {
    if (!threadId || !userId || !enabled) return;
    const { data } = await supabase
      .from('dm_read_receipts' as any)
      .select('user_id, last_read_at')
      .eq('thread_id', threadId)
      .neq('user_id', userId);

    if (data) {
      const map = new Map<string, Date>();
      (data as any[]).forEach((row: any) => {
        map.set(row.user_id, new Date(row.last_read_at));
      });
      setReadReceipts(map);
    }
  }, [threadId, userId, enabled]);

  // Mark as read on mount and when new messages arrive
  useEffect(() => {
    if (!threadId || !userId || !enabled) return;
    markAsRead();
    fetchReceipts();
  }, [threadId, userId, messages.length, enabled]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!threadId || !userId || !enabled) return;

    const channel = supabase
      .channel(`read_receipts_${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_read_receipts',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          fetchReceipts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, userId, enabled]);

  // Mark as read on window focus
  useEffect(() => {
    if (!enabled) return;
    const handleFocus = () => markAsRead();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [markAsRead, enabled]);

  const getLastSeenMessageId = useCallback(
    (otherUserId: string): string | null => {
      const lastReadAt = readReceipts.get(otherUserId);
      if (!lastReadAt) return null;

      // Find the latest message sent by current user that was read
      let lastSeenId: string | null = null;
      for (const msg of messages) {
        if (msg.sender_id === userId && new Date(msg.created_at) <= lastReadAt) {
          lastSeenId = msg.id;
        }
      }
      return lastSeenId;
    },
    [readReceipts, messages, userId]
  );

  return { readReceipts, getLastSeenMessageId, markAsRead };
}
