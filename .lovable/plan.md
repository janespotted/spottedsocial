

# Add Stories Table to Realtime Publication

## Problem
The `stories` table is not included in the `supabase_realtime` publication, so new story inserts don't trigger realtime updates to connected clients.

## Fix
Run a single database migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
```

This is a one-line schema change. No code changes needed -- the frontend already subscribes to stories via `useRealtimeSubscriptions.ts` (listening for INSERT events on the `stories` table), but those events are never fired because the table isn't in the publication.

After this migration, the existing realtime subscription in the feed will start receiving story insert events and triggering `onStoriesChange` callbacks as intended.

