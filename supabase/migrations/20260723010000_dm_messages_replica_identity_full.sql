-- dm_messages needs REPLICA IDENTITY FULL so that Supabase Realtime
-- can filter by thread_id on INSERT events. Without it, the WAL record
-- may omit non-PK columns, causing the server-side filter
-- (thread_id=eq.<id>) to miss events and delay message delivery.
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;

-- Also fix dm_read_receipts (filtered by thread_id in Thread.tsx)
-- and dm_typing_indicators (filtered by thread_id in useTypingIndicator)
ALTER TABLE public.dm_read_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.dm_typing_indicators REPLICA IDENTITY FULL;
