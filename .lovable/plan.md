
# Add Demo Yap Messages to Seed Data

## Problem
The Yap board shows no demo messages because the `seed-demo-data` edge function doesn't create any `yap_messages` records.

## Solution
Update the seed function to create demo yap messages at various demo venues, using the existing sample messages from `DEMO_YAP_MESSAGES`.

---

## Changes

### File: `supabase/functions/seed-demo-data/index.ts`

**1. Add Yap messages sample data** (around line 8):

```typescript
const YAP_TEXTS = [
  "Pretty sure Justin Bieber just walked in...",
  "This music is awesome who's the DJ right now",
  "What's everyone's move after close?",
  "Anyone here? Looking for my friends",
  "This DJ set is unreal!!!",
  "Line is crazy long outside",
  "The energy is INSANE right now",
  "Dance floor is PACKED",
  "Where's the after party at?",
  "Bartender hooked it up",
];
```

**2. Add cleanup for yap_messages** (in the cleanup section, around line 29):

```typescript
await sb.from('yap_messages').delete().eq('is_demo',true);
```

**3. Add yap messages insertion** (after posts, around line 57):

```typescript
// Yap messages - 10 anonymous messages spread across venues
await sb.from('yap_messages').insert(YAP_TEXTS.map((text, i) => {
  const v = V[i % V.length];
  const handle = `User${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    user_id: uids[i % uids.length],
    text,
    venue_name: v.name,
    is_anonymous: true,
    author_handle: handle,
    score: Math.floor(Math.random() * 80) + 5,
    comments_count: Math.floor(Math.random() * 10),
    expires_at: exp(),
    is_demo: true,
  };
}));
```

**4. Add clear for yap_messages** (in the clear section):

```typescript
await sb.from('yap_messages').delete().eq('is_demo',true);
```

---

## How It Works

The YapTab already has logic to show demo yaps (line 109-113):
```typescript
if (demoMode) {
  query = query.or(`venue_name.eq.${selectedVenue},is_demo.eq.true`);
}
```

This means in demo mode, it shows ALL demo yaps regardless of venue - so users will see activity on the Yap board even if they're not checked in at a specific venue.

---

## Result

| Content | Before | After |
|---------|--------|-------|
| Demo yap messages | 0 | 10 |
| Distribution | N/A | Spread across venues |
| Scores | N/A | Random 5-85 |

---

## Post-Implementation

Re-seed demo data after deploying:
1. Go to Demo Settings
2. Toggle demo mode off then on

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/seed-demo-data/index.ts` | Add yap sample texts, cleanup, and insertion logic |
