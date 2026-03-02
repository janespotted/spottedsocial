

## Plan: Fix Stale "Yap About It" Button

### Root Cause

The `handleShareClick` in `CheckInConfirmation.tsx` captures `checkInVenueName` from context at click-time. There are two failure modes:

1. **Private party venue name mismatch**: When checking in to a private party, `showOutConfirmation` is called with a display name like `"Private Party (Wilshire)"`. But in the YapTab, the `isPrivatePartyNav=true` path (line 52-55) waits for `userVenueName` from an async DB fetch. If the async fetch hasn't completed yet, `threadVenueName` and `view` rely solely on their initial `useState` values — which only work on first mount. If the YapTab was previously mounted, the `useState` won't reinitialize.

2. **React state not updating on re-navigation**: If the user was already on `/messages` with the yap tab open, navigating again with new state won't remount YapTab. The `venueNameProp` prop might be the same string or the effect dependencies haven't changed, so the effect at line 52-60 doesn't fire.

### Fix (2 files)

**`src/components/CheckInConfirmation.tsx`**:
- In `handleShareClick`, fall back to fetching the venue name from `night_statuses` if `checkInVenueName` is falsy, ensuring navigation always has a valid venue name.

**`src/components/messages/YapTab.tsx`**:
- Add a `key` prop to force remount when `venueNameProp` changes, OR add a separate effect that always responds to `venueNameProp` changes regardless of `isPrivatePartyNav`:
  ```tsx
  // When venueNameProp changes (new navigation), always update view
  useEffect(() => {
    if (venueNameProp) {
      setThreadVenueName(venueNameProp);
      setView('thread');
    }
  }, [venueNameProp]);
  ```
- This replaces the current conditional logic that delays setting the thread for private parties, ensuring the button *always* opens the thread immediately.

**`src/pages/Messages.tsx`**:
- Add a timestamp to `yapVenueName` state or use a counter to force YapTab remount via `key` prop when navigating from check-in confirmation:
  ```tsx
  {activeTab === 'yap' && <YapTab key={yapNavKey} venueName={yapVenueName} isPrivatePartyNav={yapIsPrivateParty} />}
  ```
  where `yapNavKey` increments each time the yap navigation state arrives.

