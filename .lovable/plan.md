

## Plan

### 1. Delete the rogue "Private party" venue from the database
Run SQL via insert tool:
```sql
DELETE FROM venues WHERE id = 'ce3629c9-b742-4079-a327-87a53ac06bef';
```
Confirmed it exists: name = "Private party".

### 2. Add blocklist to `createNewVenue()` in `src/lib/location-service.ts` (line 354)
Add a `BLOCKED_VENUE_NAMES` array before the function. At the top of `createNewVenue()`, check `name.trim().toLowerCase()` against the list. If matched, log a warning and return `null` without inserting.

Blocked terms: `private party`, `house party`, `home`, `my place`, `my house`, `my apartment`, `apartment`, `house`, `party`, `pregame`, `pre-game`, `afterparty`, `after party`, `kickback`.

### 3. Keep the "I'm at a Private Party" button
No changes needed — the button added in the last diff (lines 1024-1036 of CheckInModal.tsx) stays as-is.

