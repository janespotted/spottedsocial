

## Plan: Fix "Yap About It" Button Not Working

### Root Cause

The button click navigates to `/messages` with `location.state`, but if the user is already on `/messages`, react-router may not reliably trigger the `location.state` effect. The immediate state-clearing navigation (`navigate(location.pathname, { replace: true, state: {} })`) can also race with the initial state consumption.

### Fix: Use localStorage as a Reliable Transport

Instead of relying solely on `location.state` (which has timing issues with same-page navigation), store the yap intent in localStorage. Messages.tsx reads from both sources.

**`src/components/CheckInConfirmation.tsx`** — `handleShareClick`:
- Before navigating, write `yap_nav_venue` and `yap_nav_private_party` to localStorage
- Remove `setPhase('celebration')` (unnecessary since we're navigating away)

```typescript
const handleShareClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  const venueName = checkInVenueName;
  const isPrivateParty = checkInIsPrivateParty;
  // Store in localStorage as reliable transport
  if (venueName) {
    localStorage.setItem('yap_nav_venue', venueName);
    localStorage.setItem('yap_nav_private_party', String(!!isPrivateParty));
  }
  closeCheckInConfirmation();
  navigate('/messages', { state: { activeTab: 'yap', venueName, isPrivateParty } });
};
```

**`src/pages/Messages.tsx`** — useEffect:
- Also check localStorage for `yap_nav_venue` on mount/state change as a fallback
- Clear localStorage keys after reading

```typescript
useEffect(() => {
  const state = location.state;
  // Check localStorage fallback for yap navigation
  const lsVenue = localStorage.getItem('yap_nav_venue');
  const lsPrivateParty = localStorage.getItem('yap_nav_private_party') === 'true';

  if (state?.venueName || lsVenue) {
    const venue = state?.venueName || lsVenue;
    const isPrivateParty = state?.isPrivateParty ?? lsPrivateParty;
    setYapVenueName(venue);
    setYapIsPrivateParty(!!isPrivateParty);
    setYapNavKey(prev => prev + 1);
    setActiveTab('yap');
    // Clean up
    localStorage.removeItem('yap_nav_venue');
    localStorage.removeItem('yap_nav_private_party');
  }
  // ...rest of existing state handling
}, [location.state]);
```

### Files Changed

| File | Change |
|------|--------|
| `src/components/CheckInConfirmation.tsx` | Write yap intent to localStorage, remove `setPhase`, close before navigating |
| `src/pages/Messages.tsx` | Read from localStorage as fallback, clean up after reading |

