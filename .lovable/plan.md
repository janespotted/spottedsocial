

# Fix: Friends with "Out" Night Status Not Showing

## Root Cause
The `FriendSearchModal` status logic (lines 108-114) only recognizes two sources of "out" status:
1. Active check-in (ended_at IS NULL in checkins table) → "out"
2. Night status = "planning" → "planning"

It **ignores** `night_statuses.status = 'out'`. The database currently has 8 friends with `status = 'out'` and 4 with `status = 'planning'` in `night_statuses`, but 0 active check-ins. So all 8 "out" friends wrongly display as "home."

## Fix (FriendSearchModal.tsx, lines 108-114)

Update the status resolution to also check `nightStatus?.status === 'out'`:

```typescript
if (activeCheckin) {
  status = 'out';
  venue_name = activeCheckin;
} else if (nightStatus?.status === 'out') {
  status = 'out';
  // No venue_name — they declared "out" but aren't checked into a specific venue
} else if (nightStatus?.status === 'planning') {
  status = 'planning';
  planning_neighborhood = nightStatus.planning_neighborhood;
}
```

This ensures friends who tapped "I'm Out" (setting night_statuses.status = 'out') appear at the top of the list with the correct green styling, even if they haven't checked into a specific venue yet.

## File Modified
- `src/components/FriendSearchModal.tsx` — 3 lines added to status resolution block

