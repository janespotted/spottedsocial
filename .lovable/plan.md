

## Two Issues

### Issue 1: Yaps from prior nights are not cleaned up

The `daily-cleanup` edge function already deletes expired yap messages using the 5am ET cutoff — this is correct. However, the **client-side query** in `YapTab.tsx` (line 138-139) filters by `expires_at > now()`, which should work. Let me verify the actual problem: when yaps are created, they get an `expires_at` from `calculateExpiryTime()` in `time-utils.ts`, which correctly sets 5am. So the cleanup + client filter should work.

The real issue is likely that old yaps with missing or incorrect `expires_at` values linger. The daily-cleanup function uses `cutoff` (5am ET) to delete yaps — this is correct. If yaps are still showing, it's a client filtering issue or the cleanup cron isn't running. I'll ensure the client-side query is airtight and add the `isFromTonight` check as a fallback.

### Issue 2: No realtime subscriptions on Yap directory, Newsfeed, Plans, or Map

Currently:
- **Newsfeed (Home.tsx)**: Has realtime for posts INSERT/DELETE via `useRealtimeSubscriptions`, but only for incremental new posts — likes count changes won't reflect without refresh
- **Yap directory (YapTab.tsx)**: No realtime subscription — `fetchQuotes` only runs on mount/view change
- **Plans (PlansFeed.tsx)**: No realtime subscription at all
- **Map (Map.tsx)**: Uses `useVisibilityRefresh` but no realtime subscription for friend locations/checkins

Messages work because `MessagesTab` and `VenueYapThread` don't exist in the codebase with realtime — actually DMs work because `dm_messages` has realtime enabled and the messages tab likely subscribes.

## Plan

### 1. YapTab realtime subscription
Add a Supabase realtime channel in `YapTab.tsx` that listens for INSERT/DELETE on `yap_messages` and auto-refetches the directory quotes. This ensures new yaps appear without pull-to-refresh.

### 2. PlansFeed realtime subscription  
Add a realtime channel in `PlansFeed.tsx` listening for changes on `plans` and `plan_downs` tables. On any change, refetch plans. Need to first enable realtime for `plans` and `plan_downs` tables via migration.

### 3. Map realtime subscription
Add a realtime channel in `Map.tsx` listening for changes on `checkins` and `night_statuses`. On change, refetch friend locations. These tables already have realtime enabled.

### 4. Yap expiry client-side hardening
Add an `isFromTonight` check in `YapTab.tsx` alongside the existing `expires_at > now()` filter to ensure stale yaps never show, even if the cleanup cron hasn't run yet.

### 5. VenueYapThread realtime
Add realtime subscription in `VenueYapThread.tsx` for the specific venue's yap messages so new yaps appear live in the thread view.

### Database migration needed
- Enable realtime for `plans` and `plan_downs` tables

| File | Change |
|------|--------|
| `src/components/messages/YapTab.tsx` | Add realtime channel for `yap_messages` INSERT/DELETE to auto-refetch directory |
| `src/components/messages/VenueYapThread.tsx` | Add realtime channel for venue-specific yap messages |
| `src/components/PlansFeed.tsx` | Add realtime channel for `plans` and `plan_downs` changes |
| `src/pages/Map.tsx` | Add realtime channel for `checkins` and `night_statuses` changes |
| DB migration | Enable realtime for `plans` and `plan_downs` tables |

