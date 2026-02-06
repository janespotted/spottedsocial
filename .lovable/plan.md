
# Add Demo Planning Friends to Seed Data

## Problem
The "Who's Going Out Tonight" section shows no demo friends because the `seed-demo-data` edge function only creates `night_statuses` records with `status: 'out'` - it never creates any with `status: 'planning'`.

## Solution
Update the seed function to create some demo users with `planning` status (in addition to those with `out` status).

---

## Changes

### File: `supabase/functions/seed-demo-data/index.ts`

**Lines 49-50** - Split demo users between "out" and "planning" statuses:

```typescript
// Before (line 50):
await sb.from('night_statuses').insert(uids.slice(0,8).map((u,i)=>{
  const v=V[i%V.length];
  return{
    user_id:u,
    status:'out',
    venue_id:vm.get(v.name),
    venue_name:v.name,
    lat:v.lat,
    lng:v.lng,
    expires_at:exp(),
    is_demo:true
  };
}));

// After:
// First 5 users are "out" at venues
await sb.from('night_statuses').insert(uids.slice(0,5).map((u,i)=>{
  const v=V[i%V.length];
  return{
    user_id:u,
    status:'out',
    venue_id:vm.get(v.name),
    venue_name:v.name,
    lat:v.lat,
    lng:v.lng,
    expires_at:exp(),
    is_demo:true
  };
}));

// Next 3 users are "planning" (thinking about going out)
await sb.from('night_statuses').insert(uids.slice(5,8).map((u,i)=>{
  const v=V[i%V.length];
  return{
    user_id:u,
    status:'planning',
    planning_neighborhood:v.hood,
    planning_visibility:'all_friends',
    expires_at:exp(),
    is_demo:true
  };
}));
```

---

## Result

| Status | Before | After |
|--------|--------|-------|
| Demo users with `out` status | 8 | 5 |
| Demo users with `planning` status | 0 | 3 |

This will populate the "Who's Going Out Tonight" section with 3 demo friends who are "thinking about going out" when demo mode is enabled.

---

## Post-Implementation

After deploying, the user will need to re-seed demo data:
1. Go to Demo Settings page
2. Toggle demo mode off then on, or click "Re-seed" if available

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/seed-demo-data/index.ts` | Split night_statuses between 'out' (5 users) and 'planning' (3 users) |
