

## Pre-Launch UX Audit: Remaining Issues

### 1. Profile page N+1 query — slow load for "Recent Spots"
**File:** `src/pages/Profile.tsx` (lines 263-285)

The `fetchProfileData` function fetches recent checkins, then loops through each unique venue and fires a **separate Supabase query per venue** to get `google_photo_refs`. With 6 venues, that's 6 sequential round-trips on top of the 5 other queries already in `fetchProfileData`. This makes the profile page noticeably slow.

**Fix:** Collect all unique `venue_id`s first, then do a single `.in('id', venueIds)` query to fetch all venue images in one call.

### 2. Profile page refetches everything on window focus
**File:** `src/pages/Profile.tsx` (lines 157-166)

The `handleFocus` listener calls the full `fetchProfileData()` (which runs ~8 queries) every time the user switches back to the browser tab. This causes a visible loading flash since `setLoading(true)` is called at the top.

**Fix:** Only re-fetch the night status on focus (the thing that actually changes), not the entire profile. Or at minimum, don't set `loading = true` on re-fetches (same pattern as the Yap fix).

### 3. Profile "Log Out" button bypasses `signOut()` from AuthContext
**File:** `src/pages/Profile.tsx` (lines 757-767)

The logout button directly calls `supabase.auth.signOut()` and then `navigate('/auth')`. But `AuthContext.signOut` (line 100 of AuthContext.tsx) handles Capacitor-specific navigation via `window.history.replaceState`. Using the raw Supabase call means native app users get a full WebView reload/white flash on logout.

**Fix:** Use the `signOut` function from `useAuth()` instead of calling `supabase.auth.signOut()` directly.

### 4. Home page skeleton flashes on city change
**File:** `src/pages/Home.tsx` (lines 271-280)

The `useEffect` that fetches data has `city` in its dependency array. When city changes, it sets `isLoading = true`, causing the full `FeedSkeleton` to flash even though posts are already loaded. Same pattern as the Yap flicker bug.

**Fix:** Only show skeleton on initial load. Use a `hasFetchedOnce` flag; on subsequent fetches (city change, pull-to-refresh), keep existing posts visible while loading.

### 5. Bottom nav "Map" label is hidden
**File:** `src/components/BottomNav.tsx` (line 87)

The `isCenter` items (Map) skip rendering the label `<span>`. Every other nav item shows its label except Map — users see an icon with no text, which is inconsistent and confusing.

**Fix:** Remove the `!isCenter &&` guard so the Map label renders like the others.

---

### Changes Summary

| File | Change |
|---|---|
| `src/pages/Profile.tsx` | Batch venue image query instead of N+1 loop; use `signOut` from `useAuth()` for logout; skip `setLoading(true)` on re-fetches |
| `src/pages/Home.tsx` | Add `hasFetchedOnce` flag to prevent skeleton flash on city change |
| `src/components/BottomNav.tsx` | Show "Map" label under the center icon |

