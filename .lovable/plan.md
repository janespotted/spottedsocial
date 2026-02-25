

# Fix Yap Tab — Show Active Venue Boards

## Root Cause

The Yap tab directory query (line 61 of `YapTab.tsx`) always filters `.eq('is_demo', false)`. However, all 10 active yap posts in the database have `is_demo = true`. The VenueYapThread component correctly handles this by checking `useDemoMode()` and conditionally including demo data, but the directory view does not.

There are 8 venues with active yap posts right now (Academy LA, Sound Nightclub, EP & LP, The Dresden, The Bungalow, Akbar, Tenants of the Trees, Highland Park Bowl) — all being hidden by the `is_demo` filter.

## Changes

### 1. `src/components/messages/YapTab.tsx` — Fix demo data filtering + add hottest score display

- Import and use `useDemoMode` hook (matching what `VenueYapThread` does)
- When demo mode is enabled, remove the `is_demo = false` filter from the yap_messages query
- When demo mode is disabled, keep the existing filter
- Add `hottest_score` to the `VenueYapSummary` interface and display it alongside the hottest post preview
- Update the "Your spot" card text to show post count

### 2. `src/components/messages/VenueYapThread.tsx` — Language fix

- Change "📍 Be here to post" (line 504) to "📍 Head here to post" per the user's request

## Technical Detail

The query change is minimal. Current code:
```typescript
supabase.from('yap_messages')
  .select('venue_name, score, text')
  .gt('expires_at', new Date().toISOString())
  .eq('is_demo', false)
```

Fixed code conditionally applies the demo filter:
```typescript
let yapQuery = supabase.from('yap_messages')
  .select('venue_name, score, text')
  .gt('expires_at', new Date().toISOString());

if (!demoEnabled) {
  yapQuery = yapQuery.eq('is_demo', false);
}
```

This matches the exact pattern used in `VenueYapThread.tsx` lines 140-144.

## Files Modified
| File | Change |
|------|--------|
| `src/components/messages/YapTab.tsx` | Add `useDemoMode`, fix demo data filter, add score display |
| `src/components/messages/VenueYapThread.tsx` | Change "Be here to post" → "Head here to post" |

