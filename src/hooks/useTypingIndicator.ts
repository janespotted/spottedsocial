import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TypingUser {
  user_id: string;
  display_name: string;
}

export function useTypingIndicator(threadId: string | undefined, userId: string | undefined, memberMap: Map<string, { display_name: string }>, enabled: boolean = true) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const lastTypingSent = useRef(0);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTyping = useCallback(async () => {
    if (!threadId || !userId || !enabled) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;

    // Clear previous auto-delete timeout
    if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);

    await supabase
      .from('dm_typing_indicators' as any)
      .upsert({ thread_id: threadId, user_id: userId, updated_at: new Date().toISOString() } as any);

    // Auto-delete after 4s of no input
    clearTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from('dm_typing_indicators' as any)
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId);
    }, 4000);
  }, [threadId, userId, enabled]);

  useEffect(() => {
    if (!threadId || !userId || !enabled) return;

    const channel = supabase
      .channel(`typing_${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_typing_indicators',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          fetchTypingUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase
        .from('dm_typing_indicators' as any)
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .then(() => {});
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [threadId, userId, enabled]);

  const fetchTypingUsers = async () => {
    if (!threadId || !userId) return;
    const fiveSecsAgo = new Date(Date.now() - 5000).toISOString();
    
    const { data } = await supabase
      .from('dm_typing_indicators' as any)
      .select('user_id, updated_at')
      .eq('thread_id', threadId)
      .neq('user_id', userId)
      .gt('updated_at', fiveSecsAgo);

    if (data) {
      const users: TypingUser[] = (data as any[]).map((row: any) => ({
        user_id: row.user_id,
        display_name: memberMap.get(row.user_id)?.display_name || 'Someone',
      }));
      setTypingUsers(users);
    } else {
      setTypingUsers([]);
    }
  };

  return { typingUsers, setTyping };
}
