

## Fix: Event Venues Dominating Leaderboard

### Root Cause
The 79 event venues (type `other`) added during the venue inventory expansion all have `popularity_rank = 0`. The leaderboard sorts by `popularity_rank ASC`, so rank 0 beats rank 1 — pushing all real bars/clubs/nightclubs out of the top 20.

- NYC: 39 venues at rank 0
- LA: 34 venues at rank 0

### Fix
Run a single migration to push all `type = 'other'` venues to a high popularity rank (e.g., 900), so they appear below actual nightlife venues but remain discoverable:

```sql
UPDATE venues
SET popularity_rank = 900
WHERE type = 'other' AND popularity_rank = 0;
```

This immediately restores your real bars, clubs, and cocktail bars (rank 1+) to the top 20 leaderboard positions in both cities.

### What This Affects
- **Leaderboard**: Real venues return to top positions
- **Bootstrap energy** (`refresh-leaderboard-energy`): The function queries top 20 by `popularity_rank ASC` per city — it will now pick actual nightlife spots again
- **Map/discovery**: No change — event venues remain searchable and checkable

### Alternative
If you want event venues to never appear on the leaderboard at all, we could also add a `WHERE type != 'other'` filter to the leaderboard query. Let me know if you'd prefer that approach instead.

