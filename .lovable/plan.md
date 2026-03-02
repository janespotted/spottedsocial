

## Fix: Private Party venue tap navigates to map

### Problem
When a friend is at a private party, tapping their venue text ("@ Private Party · SoHo") on the Friend ID Card calls `handleVenueClick("Private Party")`, which queries the `venues` table for a venue named "Private Party" — no match, nothing happens.

### Fix — `src/components/FriendIdCard.tsx`

**Add a `isPrivateParty` flag** derived from userStatus. The night_statuses query already fetches `is_private_party` (line 159) and sets `currentVenue` to `'Private Party'` (line 205). Track this in the `UserStatus` interface.

**Add `isPrivateParty: boolean` to the `UserStatus` interface** (line 42). Set it to `true` when `nightStatus.is_private_party` is true (line 201), `false` everywhere else.

**Modify the venue tap handler at line 639-645**: When `userStatus.isPrivateParty` is true, instead of calling `handleVenueClick`, navigate to `/map` with the friend's coordinates passed via route state:

```typescript
const handlePrivatePartyClick = () => {
  closeFriendCard();
  navigate('/map', {
    state: {
      flyTo: {
        lat: userStatus?.lat,
        lng: userStatus?.lng,
        zoom: 15,
      }
    }
  });
};
```

In the JSX (line 639-645), split the click handler:
- If `userStatus.isPrivateParty` → call `handlePrivatePartyClick`
- Otherwise → call `handleVenueClick(userStatus.currentVenue!)`

**Update `src/pages/Map.tsx`** to read `flyTo` from `location.state` and fly the map camera to those coordinates on mount (if present). Use `map.flyTo({ center: [lng, lat], zoom })` inside an effect that watches for the state.

### Files changed
- `src/components/FriendIdCard.tsx` — add isPrivateParty to UserStatus, add private party tap handler
- `src/pages/Map.tsx` — read flyTo from route state and animate map camera

