

## Tap Friend Name → Fly to Their Location on Map

### What changes
Make the friend's display name on the Friend ID Card tappable. Tapping it closes the card and navigates to `/map` with a `flyTo` state containing the friend's coordinates — the same pattern already used for private party taps.

### `src/components/FriendIdCard.tsx`

**Add a `handleNameClick` function** (next to `handlePrivatePartyClick`):
```typescript
const handleNameClick = () => {
  if (!userStatus?.lat || !userStatus?.lng) return;
  closeFriendCard();
  navigate('/map', {
    state: {
      flyTo: {
        lat: userStatus.lat,
        lng: userStatus.lng,
        zoom: 15,
      }
    }
  });
};
```

**Make the name `<h2>` a tappable button** (~line 623-625): Wrap or replace the `<h2>` with a `<button>` that calls `handleNameClick`. Only make it tappable when the friend has a known location (`userStatus?.lat && userStatus?.lng`). Style it with `hover:underline cursor-pointer` to hint interactivity; fall back to a plain `<h2>` when no location is available.

### No changes to Map.tsx
The `flyTo` route state handler already exists from the private party feature — it will work automatically.

### Files changed
- `src/components/FriendIdCard.tsx` — add name click handler, make name tappable

