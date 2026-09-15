-- Typing indicators moved from this table to Realtime Presence.
--
-- The table stored a client-generated `updated_at`, and readers filtered it
-- against their OWN device clock (`updated_at > now() - 5s`). Two simulators
-- share a single host clock, so it always worked in development — but on real
-- devices a few seconds of NTP drift made every incoming row look stale, and
-- the indicator silently never rendered on TestFlight.
--
-- Presence is the right primitive for this: it is in-memory, carries no
-- timestamp for two clocks to disagree about, and the server evicts a member
-- as soon as their socket drops — so a killed or backgrounded client cannot
-- leave a stuck "is typing..." behind. It also removes a disk write, a WAL
-- record and a logical-replication event from every keystroke burst.
--
-- Dropping the table also clears the orphan rows it accumulated whenever a
-- client died before its 4s cleanup timer fired.

ALTER PUBLICATION supabase_realtime DROP TABLE public.dm_typing_indicators;

DROP TABLE public.dm_typing_indicators;
