

## Analysis

The private party neighborhood detection flow in CheckInModal is **already working** — it auto-detects the neighborhood from GPS (lines 301-325), shows a confirmation screen with "Detected: [neighborhood]" and a "Looks right!" button, and saves to `party_neighborhood`. No fix needed there.

The **Map** side is what needs work: private party friends show as regular venue pins instead of house icons.

## Plan: House Icons for Private Party Friends on Map

### 1. Extend `FriendLocation` interface (`src/pages/Map.tsx`, line 37-47)

Add two fields:
```typescript
is_private_party?: boolean;
party_neighborhood?: string | null;
```

### 2. Fetch `is_private_party` and `party_neighborhood` in night_statuses query (line 434)

Change the select from:
```
'user_id, venue_name, status, planning_neighborhood'
```
to:
```
'user_id, venue_name, status, planning_neighborhood, is_private_party, party_neighborhood, lat, lng'
```

### 3. Pass private party data into `friendLocations` array (lines 442-515)

In the `statuses?.forEach` block, when building `venueMap`, also build parallel maps for `is_private_party` and `party_neighborhood`. Then in the `friendLocations` mapping (line 505), include these fields.

For private party friends, override venue_name with the neighborhood label (e.g., "Private Party (West Hollywood)").

### 4. Jitter coordinates for privacy (in the mapping at line 505)

For private party friends, round lat/lng to 2 decimal places (~1km precision) and add a small random offset so they don't all stack on the same point.

### 5. Create house icon marker variant (near `createAvatarMarker` at line 770)

Add a `createHouseMarker` function that renders:
- A house icon (SVG inline, matching the Home icon from lucide) instead of an avatar
- Same ring color logic based on relationship type  
- Neighborhood label as tooltip text
- Same click handler opening friend card

### 6. Use house marker in cluster rendering (line 826+)

Before calling `createAvatarMarker`, check if the friend has `is_private_party === true`. If so, call `createHouseMarker` instead.

### Technical Details

- Coordinate jittering: `Math.round(lat * 100) / 100 + (Math.random() - 0.5) * 0.002` gives ~1km precision with slight random spread
- The house SVG will be the standard lucide Home path rendered inline (since mapbox markers use raw HTML)
- Private party friends in clusters will still cluster normally — only individual markers get the house treatment
- The jittered coordinates are used only for map display; the actual stored coordinates remain unchanged

