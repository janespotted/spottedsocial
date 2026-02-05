

## Update Venue Name: High Venice Rooftop → Kassi Rooftop

### The Issue
The LA venues database contains "High Venice Rooftop" which was the old name. The venue at Hotel Erwin in Venice Beach has been rebranded to **Kassi Rooftop** (Greek-inspired rooftop bar).

### Fix
Run a database migration to update the venue name:

```sql
UPDATE venues 
SET name = 'Kassi Rooftop',
    vibe = 'Greek-inspired rooftop bar'
WHERE name = 'High Venice Rooftop';
```

### Verification
After the update, the Leaderboard will show "Kassi Rooftop" instead of the outdated "High Venice Rooftop" name.

### Files Changed
- Database migration only (no code changes needed)

