import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TypingUser {
  user_id: string;
  display_name: string;
}

export function useTypingIndicator(threadId: string | undefined, userId: string | undefined, memberMap: Map<string, { display_name: string }>) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const lastTypingSent = useRef(0);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTyping = useCallback(async () => {
    if (!threadId || !userId) return;
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
  }, [threadId, userId]);

  useEffect(() => {
    if (!threadId || !userId) return;

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
        (payload) => {
          // Ignore our own typing upserts/deletes — otherwise every ~2s of
          // typing triggered a refetch + state update that re-rendered the
          // whole thread while the user was mid-keystroke.
          const row = (payload.new ?? payload.old) as { user_id?: string } | null;
          if (row?.user_id === userId) return;
          fetchTypingUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Clean up own typing indicator on unmount
      supabase
        .from('dm_typing_indicators' as any)
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .then(() => {});
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [threadId, userId]);

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
      // Skip the state update when nothing changed (empty -> empty was
      // creating a new array every fetch and re-rendering the thread).
      setTypingUsers(prev =>
        prev.length === 0 && users.length === 0 ? prev : users
      );
    } else {
      setTypingUsers(prev => (prev.length === 0 ? prev : []));
    }
  };

  return { typingUsers, setTyping };
}
