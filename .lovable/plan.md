

## Plan: Fix Notification Routing, Stale Data, Yap Bugs, and Realtime Updates

This addresses 6 issues across multiple files.

---

### 1. Delete the standalone `/notifications` page

The Activity Center in Messages is the canonical notification page. Remove:

- **Delete `src/pages/Notifications.tsx`**
- **`src/App.tsx`**: Remove the import (line 40) and the `/notifications` route (lines 226-233). Redirect `/notifications` to `/messages` with `activeTab: 'activity'` state (or just remove the route — it'll hit the 404).

---

### 2. Fix NotificationBanner routing by type

**`src/components/NotificationBanner.tsx`** — update `handleBannerTap`:

- `dm_message` → navigate to `/messages` with `preselectedUser` (already correct)
- `meetup_request`, `venue_invite`, `meetup_accepted`, `venue_invite_accepted` → navigate to `/messages` with `activeTab: 'activity'` (already correct)  
- `venue_yap` → navigate to `/messages` with `activeTab: 'yap'` (currently goes to activity — **fix this**)

Change line 48 to check `isYapType` first and route to yap tab.

---

### 3. Fix "Yaps at Your Spot" showing avatar but no text

**`src/components/messages/ActivityTab.tsx`** — the `renderActivityCard` function (lines 825-953) has render blocks for every activity type **except `venue_yap`**. That's why it shows avatar + empty content.

Add a `venue_yap` rendering block after the `rally` block (~line 952):

```tsx
{activity.type === 'venue_yap' && (
  <div className="text-white text-sm">
    <div className="flex items-center gap-2">
      <span className="font-semibold">{activity.display_name}</span>
      <span className="text-white/40 text-xs">{getTimeAgo(activity.timestamp)}</span>
    </div>
    <span className="text-amber-400 block text-xs mt-0.5 line-clamp-1">{activity.subtitle}</span>
  </div>
)}
```

Also add a "View" action button for `venue_yap` in the actions section (~line 1040) that navigates to the yap tab.

---

### 4. Fix "Yap about it" button staleness

**`src/components/CheckInConfirmation.tsx`** — the `handleShareClick` (line 145) navigates to `/messages` with `activeTab: 'yap'` and `venueName`. The issue is that `venueName` is captured from `checkInVenueName` which may be stale if the confirmation was opened before the check-in completed in the DB.

Fix: Capture `checkInVenueName` before clearing state. The current code already does this (line 147), but `closeCheckInConfirmation()` on line 150 resets state. Move `closeCheckInConfirmation()` **after** navigate to prevent the race:

```tsx
const handleShareClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  const venueName = checkInVenueName;
  const isPrivateParty = checkInIsPrivateParty;
  setPhase('celebration');
  navigate('/messages', { 
    state: { activeTab: 'yap', venueName, isPrivateParty } 
  });
  // Close AFTER navigation state is set
  setTimeout(() => closeCheckInConfirmation(), 100);
};
```

---

### 5. Add realtime subscriptions to Activity Center

**`src/components/messages/ActivityTab.tsx`** — currently fetches data only on mount/dependency change. No realtime updates.

Add realtime subscriptions for:
- `notifications` table (INSERT for current user's `receiver_id`) → refetch activities
- `checkins` table (INSERT/UPDATE) → refetch friends out section
- `night_statuses` table (INSERT/UPDATE) → refetch planning friends

Use a debounced `fetchAll()` call when any of these fire, with a 2-second throttle to prevent spam.

```tsx
useEffect(() => {
  if (!user) return;
  
  let debounceTimer: ReturnType<typeof setTimeout>;
  const debouncedRefresh = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { fetchAll(); fetchPlanningFriends(); }, 2000);
  };

  const channel = supabase
    .channel('activity-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_id=eq.${user.id}` }, debouncedRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, debouncedRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, debouncedRefresh)
    .subscribe();

  return () => {
    clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}, [user]);
```

Also add `useVisibilityRefresh` to ActivityTab for auto-refresh on tab return.

---

### 6. Add realtime to Messages page (status updates without refresh)

**`src/pages/Messages.tsx`** — check if it already has realtime for the active tab. The ActivityTab change above handles realtime for the activity tab. The MessagesTab and YapTab already have their own subscriptions. This should resolve the "why do I have to refresh" issue.

---

### Summary of files changed

| File | Change |
|------|--------|
| `src/pages/Notifications.tsx` | **Delete** |
| `src/App.tsx` | Remove `/notifications` route + import |
| `src/components/NotificationBanner.tsx` | Route yap banners to yap tab |
| `src/components/messages/ActivityTab.tsx` | Add `venue_yap` rendering; add realtime subscriptions; add visibility refresh |
| `src/components/CheckInConfirmation.tsx` | Fix Yap button race condition |

