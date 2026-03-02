

## Fix: "Post a Yap" Button Does Nothing After Check-In

### Root Cause
When you check in at a venue and tap "Yap about it," the app navigates to the Yap thread correctly. However, the posting input doesn't appear because of a race condition:

1. The YapTab determines if you can post by comparing your current venue (fetched async from the database) against the thread's venue name
2. When you first land on the Yap thread, that async fetch hasn't completed yet — so it thinks you're not at the venue
3. You see "Head here to post" instead of the text input, making it look like nothing works

### Fix

**`src/components/messages/YapTab.tsx`**:
- When the component receives `venueName` via navigation state (meaning the user just came from a check-in confirmation), pass `canPost={true}` directly instead of waiting for the async `night_statuses` lookup
- This is safe because the user just checked in — the confirmation screen wouldn't show the "Yap about it" button otherwise
- Keep the async fetch as a fallback for when users navigate to a thread manually from the directory

**`src/components/messages/VenueYapThread.tsx`**:
- No changes needed — the `handlePostYap` function already works correctly once `canPost` is `true`

### Files changed
- `src/components/messages/YapTab.tsx` — when `venueNameProp` is provided (navigation from check-in), set `canPost={true}` instead of relying solely on the async venue name comparison

