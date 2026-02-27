

## Plan: Fix Demo User Usernames

### Problem
Demo users are created with auto-generated usernames like `@jordan_1772065061443_2` (timestamp + index). Need realistic handles.

### Changes

**1. Update `supabase/functions/seed-demo-data/index.ts`**

Replace the `USERS` array and username generation logic. Instead of `${u[1]}_${ts}_${i}`, use city-specific realistic usernames.

New approach — define username templates per city:
```typescript
const DEMO_USERNAMES: Record<string, string[][]> = {
  nyc: [
    ["Alex","alex.soho"], ["Sam","sam_les"], ["Jordan","jordan_bk"],
    ["Taylor","taylor.ev"], ["Morgan","morgan_nyc"], ["Casey","casey.wv"],
    ["Riley","riley_chels"], ["Jamie","jamie.mpk"],
    ["Alex","alex_wburg"], ["Sam","sammy.bush"], ["Jordan","jord.midtown"],
    ["Taylor","tay_soho"]
  ],
  la: [
    ["Alex","alex.weho"], ["Sam","sam_dtla"], ["Jordan","jordan.hwood"],
    ["Taylor","taylor_sm"], ["Morgan","morgan.west"], ["Casey","casey_slake"],
    ["Riley","riley.venice"], ["Jamie","jamie_la"],
    ["Alex","alexx.hwood"], ["Sam","sammy.weho"], ["Jordan","jord_dtla"],
    ["Taylor","tay.venice"]
  ],
  pb: [
    ["Alex","alex.wpb"], ["Sam","sam_pb"], ["Jordan","jordan.clem"],
    ["Taylor","taylor_rpb"], ["Morgan","morgan.pb"], ["Casey","casey_wpb"],
    ["Riley","riley.palm"], ["Jamie","jamie_pb"],
    ["Alex","alexx.wpb"], ["Sam","sammy.pb"], ["Jordan","jord_clem"],
    ["Taylor","tay.palm"]
  ]
};
```

Update the user creation loop (line ~40) from:
```typescript
await sb.from('profiles').insert({id, display_name:u[0], username:`${u[1]}_${ts}_${i}`, ...})
```
to:
```typescript
const userList = DEMO_USERNAMES[city] || DEMO_USERNAMES['nyc'];
const u = userList[i];
await sb.from('profiles').insert({id, display_name:u[0], username:u[1], ...})
```

**2. Fix existing demo profiles in database (one-time UPDATE)**

Run an UPDATE query to patch all existing demo profiles with ugly usernames. Match by `is_demo = true` and update username to a realistic handle derived from their display_name + a city suffix.

### Files
- `supabase/functions/seed-demo-data/index.ts` — replace USERS array and username generation

