

## Analysis: City-Aware Filtering Across the App

### What's Already Working
- **Map** — filters venues by `city` via `.eq('city', cityRef.current)` ✅
- **Leaderboard** — filters by `city` via `.eq('venues.city', city)` ✅
- **Plans/Events** — filter by city ✅
- **Newsfeed** — passes `city` to `useFeed` hook ✅
- **City detection** — `useUserCity` hook with GPS detection, caching, and manual override already exists ✅
- **City detection triggers** — runs on app load and uses cache, not polling ✅

### What's Missing

**1. Yap feed has no city filter**
The `YapTab.tsx` `fetchQuotes` function queries `yap_messages` without any city constraint. It fetches all non-expired yaps globally and displays them. It should filter yaps to only show venues in the detected city by joining against the `venues` table or filtering by venue name match.

**Fix in `src/components/messages/YapTab.tsx`:**
- Import `useUserCity` hook
- After fetching yaps, filter them to only include yaps whose `venue_name` matches a venue in the current city
- Alternatively, fetch city venues first, then filter yaps client-side (simpler, avoids schema changes)
- Re-fetch when `city` changes

**2. Friends page — no change needed**
The Friends page shows friend requests, search, and invite links. This is a social graph feature, not a location feature. Filtering friends by city would break the UX (you'd miss friend requests from people in other cities). No change needed here.

**3. Home page friends list — already city-aware**
The `useFeed` hook already receives `city` and filters posts accordingly. The friends sidebar on Home shows friends who are "out" — these are already filtered by venue name matching city venues.

### Implementation Plan

| File | Change |
|---|---|
| `src/components/messages/YapTab.tsx` | Import `useUserCity`, fetch city venues, filter yaps to only show venues in the current city, add `city` to `useEffect` deps |

This is the only actual gap. Everything else requested is already implemented.

