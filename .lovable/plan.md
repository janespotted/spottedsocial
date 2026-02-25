

# Yap Tab — Quote-First Feed Redesign

## Overview
Replace the current venue-centric directory (Hottest Right Now card + Active Tonight list) with a single continuous quote-first feed. Each item is a Yap quote card with venue attribution as secondary context. The feed mixes posts from all venues, sorted by Hot or New.

## Changes — Single File: `src/components/messages/YapTab.tsx`

### Data Model Change
Currently, the `fetchDirectory` function groups yap_messages by venue and builds `VenueYapSummary[]`. The new approach fetches individual yap messages directly instead of grouping.

**New query**: Fetch all non-expired, non-private-party yap_messages with their venue metadata:
```typescript
// Fetch individual yaps, not venue summaries
const yapQuery = supabase
  .from('yap_messages')
  .select('id, text, score, venue_name, created_at')
  .gt('expires_at', new Date().toISOString())
  .eq('is_private_party', false);
```
Then join with `venues` table for neighborhood/type metadata (same pattern as current code — fetch venue names, batch lookup).

### New State
- Replace `venues: VenueYapSummary[]` with `quotes: YapQuote[]` where `YapQuote = { id, text, score, venue_name, venue_neighborhood, venue_type, created_at }`
- Add `sortMode: 'hot' | 'new'` state (default `'hot'`)
- Sorting: `'hot'` sorts by `score` descending, `'new'` sorts by `created_at` descending

### UI Structure (top to bottom)

1. **Header** (unchanged)
   - "Yap" title + subtitle — keep exactly as-is

2. **"You're At" Compact Bar** (if user is at a venue)
   - Replace the current large card with a slim horizontal bar
   - Dark background `bg-[#1a0f2e]/90` with `border border-[#d4ff00]/30`
   - Left: `📍 You're at [Venue]` in small white text
   - Right: compact "Post" pill button in `bg-[#d4ff00] text-[#1a0f2e]`
   - Height ~44px, rounded-xl, pinned above sort toggles

3. **Sort Toggles**
   - Two pill buttons: "🔥 Hot" (default) and "🕐 New"
   - Active pill: `bg-[#d4ff00]/20 text-[#d4ff00] border-[#d4ff00]/30`
   - Inactive pill: `bg-white/5 text-white/40`
   - Horizontal flex row with gap-2

4. **Quote Feed** — the main content
   - Each quote card layout:
     ```
     ┌──────────────────────────────────┐
     │ [left border accent]             │
     │  "Quote text here, large and     │
     │   bold, this is the hero..."     │
     │                                  │
     │  📍 Venue Name · Neighborhood    │
     │  ▲ 72                      1h   │
     └──────────────────────────────────┘
     ```
   - Card: `bg-gradient-to-r from-[#2d1b4e]/80 to-[#1f1338]/60`, `border border-[#a855f7]/15`, `border-l-[3px] border-l-[#d4ff00]`
   - Quote text: `text-white text-[15px] font-medium leading-relaxed` — the primary visual element
   - Venue line: `text-white/40 text-xs` with `📍` prefix, venue name tappable (stops propagation, opens thread)
   - Bottom row: upvote `▲ {score}` in `text-[#d4ff00] text-xs font-semibold` on left, relative timestamp in `text-white/30 text-xs` on right
   - Tapping card opens that venue's thread

5. **Venue Grouping** (consecutive same-venue quotes)
   - When rendering, detect consecutive quotes from the same venue
   - First card in a group gets a small venue header above it: `📍 Venue Name · Neighborhood` in `text-white/50 text-xs`
   - Subsequent cards in the same group omit the venue line (since the group header covers it)
   - The group shares a continuous left border with slightly thicker width `border-l-[4px]`

6. **Empty State** — unchanged

### What Stays the Same
- `VenueYapThread` component and navigation into threads
- The `view === 'thread'` branch — untouched
- Loading skeleton — minor tweak to show quote-shaped cards instead of venue cards
- `openThread` / `goBackToDirectory` functions
- All data filtering (demo mode, private party exclusion)

### Timestamp Formatting
Add a small helper for relative time (e.g., "1h", "23m", "3h"):
```typescript
const relativeTime = (dateStr: string) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
};
```

### Technical Notes
- No database changes needed — all data already exists in `yap_messages`
- No new dependencies
- Single file edit: `src/components/messages/YapTab.tsx`
- The `VenueYapThread` is opened the same way — `openThread(venueName)` — no changes to thread navigation

