

## Two Fixes for Profile Page

### 1. Parallelize profile data fetching (`src/pages/Profile.tsx`)

**Root cause**: `fetchProfileData` (lines 191-335) runs 8 queries sequentially — each one waits for the previous to finish. The waterfall:
1. profiles → 2. night_statuses → 3. venues (neighborhood) → 4. friendships (sent) → 5. friendships (received) → 6. checkins (count) → 7. checkins (recent) → 8. venues (images) → 9. posts → 10. resolvePostImageUrls

**Fix**: Group independent queries into `Promise.all` batches:

**Batch 1** (all independent, fire together):
- `profiles` query
- `night_statuses` query
- `friendships` sent query
- `friendships` received query  
- `checkins` (for places count)
- `checkins` (for recent spots, ordered)
- `posts` query
- `invite_codes` query (move from separate `fetchInviteCode`)

**Batch 2** (depends on Batch 1 results):
- `venues` neighborhood (needs `nightStatus.venue_id`)
- `venues` images (needs `recentCheckins` venue IDs)
- `resolvePostImageUrls` (needs posts data)

This turns ~10 sequential round trips into 2 parallel batches, cutting load time roughly in half.

**Implementation**: Replace lines 191-335 with two `Promise.all` calls. First one fires all independent queries. Second one fires dependent queries using results from the first.

### 2. Fix "Mutual Friends" text overflow (`src/pages/Profile.tsx`)

**Line 630**: Change `min-w-[130px]` to `min-w-[150px]` on the `SelectTrigger` to ensure "Mutual Friends" fits within the pill without overflowing.

