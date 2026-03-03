

## Problem

When clicking "Yap about it" from the venue check-in prompt, navigation to the user's venue Yap thread is unreliable. The root cause is in how `Messages.tsx` handles the navigation state:

1. **Same-page navigation fails**: If the user is already on `/messages`, React Router's `navigate('/messages', { state: ... })` may not re-trigger the `useEffect` because `location.state` reference comparison doesn't always detect changes.
2. **State cleared too eagerly**: The `useEffect` immediately clears `location.state` with `navigate(location.pathname, { replace: true, state: {} })`, which can race with state reads.
3. **`yapVenueName` not reset between navigations**: Once set, `yapVenueName` persists even after clearing, so subsequent "Yap about it" taps may not trigger a YapTab re-mount with the new venue.

## Fix (1 file: `src/pages/Messages.tsx`)

Replace the current `useEffect` approach with a more robust pattern:

- Use `location.key` (changes on every navigation) as a dependency instead of `location.state` reference
- Read state + localStorage in the same pass
- Increment `yapNavKey` on every valid venue navigation to force YapTab re-mount
- Clear localStorage and state after consuming, but don't clear `yapVenueName` — let the `key` prop handle freshness

This ensures that even if the user is already on `/messages` and clicks "Yap about it," the navigation state is always consumed and YapTab always re-mounts with the correct venue.

### Specific change

```typescript
// In the useEffect, use location.key as dependency
useEffect(() => {
  const state = location.state as any;
  const lsVenue = localStorage.getItem('yap_nav_venue');
  const lsPrivateParty = localStorage.getItem('yap_nav_private_party') === 'true';

  if (state?.venueName || lsVenue) {
    const venue = state?.venueName || lsVenue;
    const isPrivateParty = state?.isPrivateParty ?? lsPrivateParty;
    setYapVenueName(venue);
    setYapIsPrivateParty(!!isPrivateParty);
    setYapNavKey(prev => prev + 1);
    setActiveTab('yap');
    localStorage.removeItem('yap_nav_venue');
    localStorage.removeItem('yap_nav_private_party');
    navigate(location.pathname, { replace: true, state: {} });
  } else if (state?.preselectedUser) {
    setPreselectedUser(state.preselectedUser);
    setActiveTab('messages');
    navigate(location.pathname, { replace: true, state: {} });
  } else if (state?.activeTab) {
    setActiveTab(state.activeTab);
    navigate(location.pathname, { replace: true, state: {} });
  }
}, [location.key]); // <-- key changes on every navigation, guaranteeing re-execution
```

The critical change is switching the dependency from `location.state` to `location.key` and only clearing state after consuming it (not unconditionally).

