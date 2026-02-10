

# Fix Performance Concerns

## Overview

There are 5 major performance bottlenecks that will cause problems at 100+ concurrent users. This plan addresses each one, ordered by impact.

---

## 1. Cache `get_profiles_safe()` with React Query (Highest Impact)

**Problem:** The RPC `get_profiles_safe()` fetches ALL profiles from the database. It's called independently in 13+ components (Map, Messages, NewChat, VenueIdCard, ActivityTab, etc.), often multiple times per page load.

**Fix:** Create a shared React Query hook that caches the result with a 60-second stale time. All components switch to using this hook instead of calling the RPC directly.

**New file:** `src/hooks/useProfilesCache.ts`
```typescript
export function useProfilesSafe() {
  return useQuery({
    queryKey: ['profiles-safe'],
    queryFn: () => supabase.rpc('get_profiles_safe'),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}
```

**Files to update (swap `supabase.rpc('get_profiles_safe')` calls):**
- `src/pages/Map.tsx`
- `src/components/messages/MessagesTab.tsx`
- `src/components/messages/NewChatDialog.tsx`
- `src/components/messages/NewGroupChatDialog.tsx`
- `src/components/messages/ActivityTab.tsx`
- `src/components/VenueIdCard.tsx`
- `src/components/InviteFriendsModal.tsx`
- `src/components/PrivatePartyInviteModal.tsx`
- `src/components/PlansFeed.tsx`
- `src/components/FindFriendsOnboarding.tsx`
- `src/components/VenueEventsSection.tsx`

---

## 2. Deduplicate Friendship Queries with a Shared Hook

**Problem:** The same 2-query pattern (select sent friendships + received friendships) is repeated in ~19 files. Each page load fires 2+ redundant friendship queries.

**Fix:** Create a `useFriendIds` hook with React Query caching.

**New file:** `src/hooks/useFriendIds.ts`
```typescript
export function useFriendIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['friend-ids', userId],
    queryFn: async () => { /* fetch both directions, dedupe, return */ },
    staleTime: 2 * 60_000,
    enabled: !!userId,
  });
}
```

**Files to update:** `useFeed.ts`, `Home.tsx`, `Map.tsx`, `FriendIdCard.tsx`, `PrivatePartyInviteModal.tsx`, `NewGroupChatDialog.tsx`, `ActivityTab.tsx`, `PlansFeed.tsx`

---

## 3. Move City Filtering to Database Queries

**Problem:** Posts and stories are fetched for ALL cities, then filtered client-side. The Map page fetches ALL venues (`select('*')`) then filters by city in JS.

**Fix:**
- **Posts/Stories in `useFeed.ts`:** Join posts with venues and filter by city in the query, or add a `city` column to posts
- **Map venues:** Add `.eq('city', city)` to the venues query instead of fetching everything

**Files to update:**
- `src/hooks/useFeed.ts` - Remove the separate `cityVenues` query + client filter; instead, fetch venues once and join or use `.in('venue_id', cityVenueIds)` in the posts query
- `src/pages/Map.tsx` - Change `select('*')` on venues to `select('*').eq('city', city)`

---

## 4. Replace Full Refetch on Realtime Events with Incremental Updates

**Problem:** When any user posts anything, the `onPostsChange` callback triggers `fetchPosts()` which re-fetches ALL posts, friendships, and venues. Same for stories.

**Fix:** For new posts via realtime:
1. Fetch only the new post by ID from the realtime payload
2. Check if it belongs to a friend (using cached friend IDs)
3. Prepend it to the existing posts array

For deleted posts: Simply filter it out of state.

**Files to update:**
- `src/hooks/useFeed.ts` - Add `handleIncrementalNewPost(payload)` and `handleIncrementalDelete(payload)`
- `src/hooks/useRealtimeSubscriptions.ts` - Already supports `onNewPost` / `onPostDeleted` handlers
- `src/pages/Home.tsx` and `src/pages/Feed.tsx` - Use the incremental handlers instead of `fetchPosts`

---

## 5. Add Cursor-Based Pagination to Feed

**Problem:** All posts are fetched at once. With 100+ users each posting, this will grow unbounded.

**Fix:** Fetch 20 posts at a time with a "Load More" button or infinite scroll using the `created_at` cursor.

**Files to update:**
- `src/hooks/useFeed.ts` - Add `limit(20)` and a `loadMore()` function using `.lt('created_at', lastPostDate)`
- `src/pages/Home.tsx` and `src/pages/Feed.tsx` - Add infinite scroll or "Load More" trigger

---

## Implementation Order

| Step | Change | Risk |
|------|--------|------|
| 1 | Cache `get_profiles_safe` with React Query | Low - additive change |
| 2 | Create `useFriendIds` shared hook | Low - refactor with same behavior |
| 3 | Add `.eq('city', city)` to Map venues query | Low - simple filter |
| 4 | Incremental realtime updates | Medium - needs testing |
| 5 | Feed pagination | Medium - UI change needed |

---

## Expected Impact

- **Queries per page load:** ~15-20 down to ~5-8
- **Data transferred:** ~60-70% reduction (no more fetching all profiles/venues)
- **Realtime scalability:** From O(N) refetches to O(1) incremental updates
- **Feed scalability:** Bounded at 20 posts per fetch instead of unbounded

