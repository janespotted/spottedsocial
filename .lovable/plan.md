

## Plan: Staleness Detection + "Still Here?" Push Nudge

This plan adds two layers: (1) automatic filtering/checkout of stale check-ins (2h), and (2) a "still here?" push notification with auto-checkout on no response.

---

### Piece 1: Staleness Detection & Auto-Checkout

#### 1a. Add 2-hour staleness filter to Map's `fetchFriendsLocations`

**`src/pages/Map.tsx` (~line 442-449)**

Add a `last_location_at` freshness check alongside the existing `isFromTonight` filter:

```typescript
// Add: filter out friends whose last_location_at is >2 hours old
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
friendProfiles = friendProfiles.filter((p: any) => {
  if (!p.last_location_at) return false;
  const age = Date.now() - new Date(p.last_location_at).getTime();
  return age < TWO_HOURS_MS;
});
```

This goes after the existing `isFromTonight` filter at line 442-449, before demo filtering.

#### 1b. Add 2-hour staleness filter to ActivityTab "Friends Out Now"

**`src/components/messages/ActivityTab.tsx` (~line 407-420)**

After the checkins query with `is('ended_at', null)` and `gte('started_at', tonightCutoff)`, add client-side filter:

```typescript
// Filter out stale check-ins (last_updated_at > 2 hours ago)
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const freshCheckIns = filteredCheckIns.filter(c => {
  const lastUpdate = c.last_updated_at || c.started_at;
  if (!lastUpdate) return false;
  return Date.now() - new Date(lastUpdate).getTime() < TWO_HOURS_MS;
});
```

Use `freshCheckIns` instead of `filteredCheckIns` for the deduplication step.

#### 1c. Auto-checkout stale users in `useAutoVenueTracking`

**`src/hooks/useAutoVenueTracking.ts`**

In the heartbeat's `start()` function (after confirming user status is 'out'), add a staleness check:

```typescript
// Before starting heartbeat, check if current checkin is stale (>2h)
const { data: activeCheckin } = await supabase
  .from('checkins')
  .select('started_at, last_updated_at')
  .eq('user_id', user.id)
  .is('ended_at', null)
  .order('started_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (activeCheckin) {
  const lastActivity = activeCheckin.last_updated_at || activeCheckin.started_at;
  const age = Date.now() - new Date(lastActivity).getTime();
  if (age > 2 * 60 * 60 * 1000) {
    // Auto-checkout: end checkin, clear profile, reset status
    await supabase.from('checkins').update({ ended_at: new Date().toISOString() })
      .eq('user_id', user.id).is('ended_at', null);
    await supabase.from('profiles').update({
      is_out: false, last_known_lat: null, last_known_lng: null, last_location_at: null
    }).eq('id', user.id);
    await supabase.from('night_statuses').update({
      status: 'home', venue_name: null, venue_id: null, lat: null, lng: null, expires_at: null
    }).eq('user_id', user.id);
    logEvent('auto_checkout_stale', { reason: '2h_no_activity' });
    return; // Don't start heartbeat
  }
}
```

Also add `logEvent` import to this file.

---

### Piece 2: "Still Here?" Push Nudge

#### 2a. Schedule reminder on check-in

**`src/components/CheckInModal.tsx` (~line 558-623, inside `handleVenueConfirm` for 'out' status)**

After a successful check-in, save the still-here timer:

```typescript
// Schedule "still here?" check for 2 hours from now
localStorage.setItem('still_here_check', String(Date.now() + 2 * 60 * 60 * 1000));
localStorage.setItem('still_here_venue', finalVenueName);
```

Add this after `startLocationTracking` (line 575) and before the `showOutConfirmation` calls.

Also clear the timer when user goes home (in `stopLocationTracking` ~line 165):

```typescript
localStorage.removeItem('still_here_check');
localStorage.removeItem('still_here_venue');
```

#### 2b. Check the timer in Layout.tsx

**`src/components/Layout.tsx`**

Extend the existing reminder-check `useEffect` (line 42-66) to also handle the `still_here_check` timer:

```typescript
// Check "still here?" timer
const stillHereTime = localStorage.getItem('still_here_check');
if (stillHereTime && Date.now() >= Number(stillHereTime)) {
  const venueName = localStorage.getItem('still_here_venue') || 'your spot';
  // Set a 30-minute auto-checkout deadline
  if (!localStorage.getItem('still_here_deadline')) {
    localStorage.setItem('still_here_deadline', String(Date.now() + 30 * 60 * 1000));
  }
  showBrowserNotification(
    `Still at ${venueName}?`,
    'Tap to confirm or head home'
  );
  localStorage.removeItem('still_here_check');
  // Show in-app prompt (reuse check-in modal or toast with actions)
}

// Check auto-checkout deadline (30 min after nudge with no response)
const deadline = localStorage.getItem('still_here_deadline');
if (deadline && Date.now() >= Number(deadline)) {
  localStorage.removeItem('still_here_deadline');
  localStorage.removeItem('still_here_venue');
  // Perform auto-checkout
  performAutoCheckout(user);
}
```

#### 2c. Create `performAutoCheckout` utility

**New file: `src/lib/auto-checkout.ts`**

```typescript
export async function performAutoCheckout(userId: string) {
  await supabase.from('checkins').update({ ended_at: new Date().toISOString() })
    .eq('user_id', userId).is('ended_at', null);
  await supabase.from('profiles').update({
    is_out: false, last_known_lat: null, last_known_lng: null, last_location_at: null
  }).eq('id', userId);
  await supabase.from('night_statuses').update({
    status: 'home', venue_name: null, venue_id: null, lat: null, lng: null, expires_at: null
  }).eq('user_id', userId);
  logEvent('auto_checkout_stale', { reason: 'still_here_no_response' });
}
```

#### 2d. "Yes, still here" and "No, heading home" actions

**`src/components/Layout.tsx`**

When the still-here nudge fires, show a toast with two action buttons:
- **Yes, still here**: refresh `last_location_at` to now, update `checkins.last_updated_at`, clear `still_here_deadline`, set a new `still_here_check` for 2 more hours
- **No, heading home**: call `performAutoCheckout`, clear all still-here localStorage keys

Use `sonner` toast with action buttons for the in-app prompt.

---

### Summary of files changed

| File | Change |
|------|--------|
| `src/pages/Map.tsx` | Add 2h staleness filter in `fetchFriendsLocations` |
| `src/components/messages/ActivityTab.tsx` | Add 2h staleness filter for "Friends Out Now" check-ins |
| `src/hooks/useAutoVenueTracking.ts` | Add stale checkin detection + auto-checkout on heartbeat start |
| `src/components/CheckInModal.tsx` | Schedule `still_here_check` on check-in; clear on go-home |
| `src/components/Layout.tsx` | Check still-here timer; show nudge toast; auto-checkout on deadline |
| `src/lib/auto-checkout.ts` | New shared utility for auto-checkout logic |
| `src/lib/event-logger.ts` | Add `auto_checkout_stale` to EventType union |

