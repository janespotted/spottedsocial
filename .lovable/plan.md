

# Fix Friend Search: Performance, Duplicates, Ordering & Sleeker UI

## Problems Identified

1. **Buffering / Slow load**: N+1 query problem — for each friend, 3 separate DB queries fire sequentially (checkins, night_statuses, stories). With 20 friends that's 60+ queries.
2. **Duplicates**: `friendIds` array is never deduplicated. If user A friended user B *and* B friended A, the same person shows up twice.
3. **No status ordering**: Results come back alphabetically. Should be: out → planning → home.
4. **UI is heavy**: Thick borders, oversized cards, gradient background feels chunky.

## Solution (single file: `FriendSearchModal.tsx`)

### Performance Fix — Batched Queries
Replace the `Promise.all(profiles.map(async profile => ...))` N+1 pattern with 4 parallel batch queries:

```text
Before (N+1):
  friendships → profiles → for EACH profile:
    checkins query
    night_statuses query
    stories query
  = 2 + (N × 3) queries

After (batched):
  friendships (2 parallel) → then all 4 in parallel:
    profiles .in(friendIds)
    checkins .in(friendIds).is('ended_at', null)
    night_statuses .in(friendIds).gt('expires_at', now)
    stories .in(friendIds).gt('expires_at', now)
  = 6 queries total, always
```

Build `Map` lookups from the batch results, then map profiles in O(1) per friend.

### Deduplication Fix
Wrap `friendIds` in `new Set(...)` before using:
```
const friendIds = [...new Set([...sent, ...received])];
```

### Ordering Fix
After building the friends array, sort by status priority then alphabetically:
```
const STATUS_ORDER = { out: 0, planning: 1, home: 2 };
friendsData.sort((a, b) => {
  const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  return diff !== 0 ? diff : a.display_name.localeCompare(b.display_name);
});
```

### Sleeker UI Changes
- **Background**: Solid `bg-[#0a0118]` instead of gradient, subtle top border
- **Cards**: Remove heavy borders/backgrounds. Use transparent cards with `hover:bg-white/5` — clean, minimal
- **Avatar rings**: Color-coded by status — `ring-[#d4ff00]/50` for out, `ring-[#a855f7]/40` for planning, `ring-white/10` for home
- **Status badges**: Lighter backgrounds (`bg-[#d4ff00]/15`), smaller text (`text-[11px]`), "Home" shown as plain text instead of a pill
- **Loading skeleton**: Replace text spinner with 6 shimmer rows (avatar + text placeholders)
- **Status summary bar**: Shows "3 out · 2 planning" below the search bar
- **Tighter spacing**: `p-3` cards, `h-10` avatars, `space-y-1` gap
- **Search input**: `bg-white/5`, `rounded-xl`, subtler placeholder color

### File Modified
- `src/components/FriendSearchModal.tsx` — full rewrite of fetch logic + UI

