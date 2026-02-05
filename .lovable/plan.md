
Goal
- Make “map promoted” venues (e.g., Spotlight LA) clearly visible on /map even when friend avatars overlap them.

What I found
- The backend data is correct: there is at least one LA venue with is_map_promoted = true (“Spotlight LA”).
- Venue markers are being fetched (map:venues_load shows ~314 LA venues) and the map code does include map promoted venues in the marker list.
- The map currently renders friend avatar markers at zIndex 10 and venue markers at zIndex 5/8, but the venue marker elements do not set a positioning context. In CSS, z-index generally only takes effect on positioned elements (position not “static”), and Mapbox marker stacking also depends on DOM order. Result: a promoted venue can exist but be visually “buried” under friend markers/clusters at the same coordinates.

Implementation plan (no backend changes)
1) Update venue marker DOM styling to ensure z-index actually applies
   - In src/pages/Map.tsx, when creating the venue marker element (el), add:
     - el.style.position = 'relative'
     - keep el.style.zIndex but increase promoted zIndex to exceed friends (e.g., promoted 30, non-promoted 12)
   - Reason: this makes stacking deterministic and prevents promoted pins from being hidden by avatars.

2) Force Mapbox marker wrapper stacking for promoted venues
   - After marker.addTo(map.current!), access the marker’s wrapper element:
     - const wrapper = marker.getElement()?.parentElement
     - if wrapper exists, set wrapper.style.zIndex to match the intended stacking (promoted higher than friends)
   - Reason: Mapbox wraps the element in a .mapboxgl-marker container; setting z-index on the wrapper is the most reliable way to control stacking across browsers.

3) Make promoted pins unmistakable (optional but recommended for clarity)
   - Slightly increase promoted marker size and glow intensity (already larger, but we’ll ensure it stands out).
   - Add a small “PROMOTED” micro-label or venue name under the promoted pin at higher zoom (e.g., zoom >= 13.5) to remove ambiguity (“is that a venue pin or something else?”).
   - Keep tap-target separation: clicking the pin opens the Venue ID Card only.

4) Verify with a quick debug check (dev-only logging)
   - Add a one-time console/info log when is_map_promoted venues are included in filteredVenues (count + venue names) to confirm the promoted venue is being rendered on the client.
   - Remove/keep minimal logging depending on your preference for production cleanliness.

Acceptance criteria
- On /map (LA), Spotlight LA appears as a distinct promoted venue pin (star + glow) without being hidden by nearby friend markers.
- Promoted venue remains visible at common zoom levels (12–15) and while panning/zooming.
- Clicking the promoted pin opens the Venue ID Card reliably.

Files to change
- src/pages/Map.tsx
  - Venue marker creation: apply position + improved z-index strategy
  - After addTo: set wrapper z-index for promoted markers
  - (Optional) label behavior for promoted pins at higher zoom

Risks / edge cases
- If a friend avatar is exactly on top of a promoted venue, stacking fixes should resolve visibility. If not, we can additionally add a small coordinate offset for promoted pins only when collisions are detected (second-pass enhancement), but I won’t do that unless needed to avoid “pins drifting off venue”.
