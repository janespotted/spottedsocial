
# Fix: Demo Data Leaking Into Real Mode

## Problem

With demo mode OFF, two things are broken:
1. "Who's Going Out Tonight" shows fake demo users (Sam, Alex, Jordan) with NYC neighborhoods
2. Events section shows demo events from NYC (Friday DJ at Le Bain, Industry Night at House of Yes)

This happens because the seed function creates friendships between your real account and demo users, so they appear as "friends" in normal queries. Also, events have no `is_demo` or city filter.

## Changes

### 1. `src/components/PlansFeed.tsx` - `fetchPlanningFriends` (non-demo path)

Add `is_demo = false` filter to the `night_statuses` query so demo users never appear when demo mode is off:

```typescript
// After line 168 (the non-demo path query for planning statuses)
const { data: planningStatuses } = await supabase
  .from('night_statuses')
  .select('user_id, planning_neighborhood')
  .in('user_id', friendIds)
  .eq('status', 'planning')
  .eq('is_demo', false)            // NEW: exclude demo statuses
  .gte('expires_at', new Date().toISOString());
```

### 2. `src/components/PlansFeed.tsx` - `fetchEvents`

Add two filters:
- `is_demo = false` to exclude seeded demo events
- Filter by `city` to only show events in the user's detected city

```typescript
const { data: eventsData } = await supabase
  .from('events')
  .select('*')
  .gte('event_date', today)
  .gt('expires_at', new Date().toISOString())
  .eq('is_demo', false)              // NEW: exclude demo events
  .eq('city', city)                   // NEW: only show events in user's city
  .order('event_date', { ascending: true });
```

Also filter RSVPs to exclude demo user RSVPs:
```typescript
const friendRsvps = rsvps.filter(r => friendIds.includes(r.user_id));
```
This already works correctly since demo user IDs won't be in `friendIds` once we filter them out of friendships -- but as extra safety, we can also filter profiles.

### 3. `src/pages/Home.tsx` - `fetchPlanningFriends` (non-demo path)

The existing code only filters demo statuses when `bootstrapEnabled` is true. Change to ALWAYS filter out demo statuses when demo mode is off:

```typescript
// Change from:
if (bootstrapEnabled && !demoEnabled) {
  statusQuery = statusQuery.eq('is_demo', false);
}

// To:
if (!demoEnabled) {
  statusQuery = statusQuery.eq('is_demo', false);
}
```

And similarly for profile filtering:
```typescript
// Change from:
const filteredProfiles = (bootstrapEnabled && !demoEnabled)
  ? (profiles || []).filter((p: any) => !p.is_demo)
  : (profiles || []);

// To:
const filteredProfiles = !demoEnabled
  ? (profiles || []).filter((p: any) => !p.is_demo)
  : (profiles || []);
```

## Summary

| File | Change |
|------|--------|
| `src/components/PlansFeed.tsx` | Add `is_demo = false` filter to planning friends query in non-demo path |
| `src/components/PlansFeed.tsx` | Add `is_demo = false` and `city` filter to events query |
| `src/pages/Home.tsx` | Always filter demo statuses/profiles when demo mode is off (not just in bootstrap mode) |

## Result

In real mode: no fake people, no fake events, city-appropriate data only. Demo mode continues to work exactly as before.
