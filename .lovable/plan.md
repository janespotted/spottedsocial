

## Multi-Bug Fix Plan (8 items)

### #4a — Fix Yap images being cropped

**File:** `src/components/messages/VenueYapThread.tsx` (~lines 835-851)

Change `object-cover` to `object-contain` and remove the fixed `h-64` height on yap media images/videos. Use `max-h-96 w-full` instead so images display fully without cropping.

```tsx
// Image: object-cover h-64 → object-contain max-h-96
// Video: same change
```

---

### #4b — Fix stale Yaps persisting past 5am reset

**File:** `src/components/messages/VenueYapThread.tsx` (~lines 388-392)

The expiry calculation in `handlePostYap` is buggy — it always adds 1 day, then conditionally adds another. Replace with `calculateExpiryTime()` from `@/lib/time-utils` (already imported elsewhere and correctly handles the 5am boundary).

```tsx
// Before (wrong):
const expiry = new Date(now);
expiry.setDate(expiry.getDate() + 1);
expiry.setHours(5, 0, 0, 0);
if (now.getHours() >= 5) expiry.setDate(expiry.getDate() + 1);

// After (correct):
import { calculateExpiryTime } from '@/lib/time-utils';
// ...
expires_at: calculateExpiryTime(),
```

The fetch query already filters `.gt("expires_at", new Date().toISOString())` so once the expiry is correct, old yaps will stop appearing.

---

### #5 — Fix check-in modal dismiss and keyboard behavior

**File:** `src/components/CheckInModal.tsx`

The CheckInModal already uses `Drawer` (mobile) and `Dialog` (desktop) with `onOpenChange` handlers, which should handle backdrop taps. The Drawer component from vaul handles swipe-to-dismiss but may not dismiss on backdrop tap by default.

**Fix 1 — Backdrop dismiss:** The Drawer's `onOpenChange` is already wired. Add an explicit `onClose` callback to call `onOpenChange(false)` and ensure the overlay is clickable. The `DrawerContent` may need an overlay — check if vaul's Drawer includes one by default.

**Fix 2 — Keyboard dismiss on close:** Add a `useEffect` that blurs the active element when `open` transitions to `false`:

```tsx
useEffect(() => {
  if (!open) {
    (document.activeElement as HTMLElement)?.blur();
  }
}, [open]);
```

On native Capacitor, also try importing `Keyboard` from `@capacitor/keyboard` and calling `Keyboard.hide()` in the same effect (with a try/catch for web fallback). Note: `@capacitor/keyboard` is not currently installed — we'll use the blur approach which works cross-platform.

---

### #6 — Fix profile picture not showing on profile page

**File:** `src/pages/Profile.tsx` (~line 514)

The avatar is rendered as:
```tsx
<AvatarImage src={profile?.avatar_url || undefined} />
```

The `profile` object is fetched from `profiles` table and includes `avatar_url`. The `avatars` bucket is public, so URLs should work directly. 

Likely issue: the `avatar_url` stored in the profile may be a relative path (not a full URL) if set via the edit profile page. Need to check `EditProfile.tsx` to see how avatar URLs are stored and resolve them correctly — if relative, construct the full public URL.

**Action:** Check EditProfile.tsx, then fix the avatar display to handle both full URLs and relative paths by constructing the Supabase storage public URL when needed.

---

### #8 — Wire camera/photo library to newsfeed

**Already done.** The Feed page already has a `CreatePostDialog` component (line 19, opened via `showCreatePost` state). The `CreatePostDialog` uses `PostMediaPicker` which provides camera and gallery options, and `PostCaptionScreen` which handles upload to `post-images` storage bucket. The FAB button at the bottom of the feed (the `+` button) opens this flow.

No changes needed — this feature is already wired. Will verify and note.

---

### #9 — Show "Anonymous" instead of User IDs in Yap

**File:** `src/components/messages/VenueYapThread.tsx` (~line 821)

Currently displays: `{msg.author_handle || \`User${msg.id.slice(0, 6)}\`}`

The `author_handle` is set to `User${random6digits}` on creation. The fallback shows a truncated ID. Change to always show "Anonymous":

```tsx
// Before:
{msg.author_handle || `User${msg.id.slice(0, 6)}`}

// After:
Anonymous
```

Same for comments (~line 872):
```tsx
{comment.author_handle || `User${comment.id.slice(0, 6)}`}
// → Anonymous
```

---

### #10 — Private Party Yap tied to venue_id

**Already correct.** The VenueYapThread uses `party_id` (the `night_statuses.id`) for private party scoping (line 217: `query.eq("party_id", partyId)`). This is the correct scoping mechanism per the architecture memory. No changes needed.

---

### #11 — Maps opens native Apple Maps

**File:** `src/components/VenueIdCard.tsx` (~line 494-497)

Currently uses Google Maps URL. Change to use `maps://` on iOS native and keep Google Maps on web/Android:

```tsx
const handleMapPinClick = () => {
  if (venue) {
    if (isNativePlatform() && Capacitor.getPlatform() === 'ios') {
      const mapsUrl = `maps://?daddr=${venue.lat},${venue.lng}`;
      window.open(mapsUrl, '_self');
    } else {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`;
      openExternalUrl(mapsUrl);
    }
  }
};
```

---

### Summary of files to change

| # | File | Change |
|---|------|--------|
| 4a | `VenueYapThread.tsx` | `object-cover h-64` → `object-contain max-h-96` |
| 4b | `VenueYapThread.tsx` | Use `calculateExpiryTime()` for yap expiry |
| 5 | `CheckInModal.tsx` | Blur active element on modal close |
| 6 | `Profile.tsx` + `EditProfile.tsx` | Fix avatar URL resolution |
| 8 | — | Already wired (no change) |
| 9 | `VenueYapThread.tsx` | Display "Anonymous" instead of handles/IDs |
| 10 | — | Already correct (no change) |
| 11 | `VenueIdCard.tsx` | Use `maps://` URL scheme on iOS |

Need to also check `EditProfile.tsx` for avatar storage format before finalizing #6.

