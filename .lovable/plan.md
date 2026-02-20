

# Add Missing Tables to Realtime Publication

## Problem
Two tables are subscribed to via realtime in the frontend code but are **not** in the `supabase_realtime` publication, so their change events never fire.

### 1. `post_likes`
- **Subscribed in**: `src/hooks/useRealtimeSubscriptions.ts` (all events)
- **Impact**: Like count changes from other users don't push to the feed in real time. This is partially mitigated by optimistic updates on the liker's own device, but other viewers won't see like counts update live.

### 2. `venues`
- **Subscribed in**: `src/pages/Map.tsx` (UPDATE events)
- **Impact**: When venue coordinates or data are corrected (e.g., the auto-correction system), the map doesn't refresh in real time. Users must manually reload.

## Fix
Single database migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
```

No code changes needed -- the frontend already has the subscription logic wired up.

## Summary of realtime publication after this fix

All tables the app subscribes to will be covered:
- checkins, dm_messages, night_statuses, notifications, posts, post_likes, profiles, stories, venue_buzz_messages, venue_reviews, venues, yap_messages
