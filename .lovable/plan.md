

## Problem

The `get-venue-hours` edge function builds photo URLs like:
```
https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=XXXXX&key=YOUR_API_KEY
```

These are stored in `google_photo_refs` and sent directly to the client. Two issues:
1. **Expired references** — Google photo references expire after weeks/months, causing the map tile fallback you see
2. **API key leak** — the secret key is embedded in every URL visible to users

## Fix

Create a `get-venue-photo` edge function that proxies photo requests. The client sends a venue ID + photo index, and the function fetches the image from Google and streams it back. Photo references are stored without the API key.

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/get-venue-photo/index.ts` | **New** — proxy edge function that takes `venueId` + `photoIndex`, reads the stored `photo_reference` from DB, fetches the image from Google Places Photo API server-side, and returns the binary image with proper content-type headers |
| 2 | `supabase/functions/get-venue-hours/index.ts` | Store raw `photo_reference` strings in `google_photo_refs` instead of full URLs with API key |
| 3 | `src/components/VenueIdCard.tsx` | Build photo URLs as calls to the proxy edge function instead of using raw Google URLs |
| 4 | `src/pages/Profile.tsx` | Same URL change for venue images on the profile page |

### How the proxy works

```
Client: GET /get-venue-photo?venueId=abc&index=0
Server: reads google_photo_refs[0] from venues table
        → fetches https://maps.googleapis.com/maps/api/place/photo?photo_reference=XXX&key=SECRET
        → streams image bytes back with Cache-Control: public, max-age=86400
```

The 7-day cache on photo references in the DB stays. If a reference is stale and Google returns an error, the proxy returns a 404 so the client can show the gradient fallback instead of a map tile.

### Technical detail

- The proxy sets `Cache-Control: public, max-age=86400` so browsers cache images for 24h, avoiding repeated edge function calls
- Photo references are stored as plain strings (e.g., `["Aap_uE...", "Bbc_xY..."]`) — no API key in the DB
- The edge function requires auth (same JWT pattern as `get-venue-hours`)

