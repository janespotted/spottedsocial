

# Unify Tonight's Buzz into Yap

## Overview
Kill "Tonight's Buzz" as a concept. Replace it with a one-line Yap preview on venue cards. Make Yap readable without login. One word, one system, two surfaces.

## Scope of Changes

### Files to modify
- `src/components/VenueIdCard.tsx` -- remove Buzz fetching/display, add Yap preview
- `src/components/CheckInConfirmation.tsx` -- remove DropVibeDialog, update copy
- `src/components/CreateStoryDialog.tsx` -- remove "buzz" audience option
- `src/components/StoryAudienceSheet.tsx` -- remove "buzz" and "both" options
- `src/components/messages/YapTab.tsx` -- accept optional `venueName` prop, support unauthenticated browsing, show login prompt for actions
- `src/pages/Messages.tsx` -- pass venue context to YapTab when navigating from venue card
- `src/components/DemoActivator.tsx` -- update toast copy
- `src/pages/DemoSettings.tsx` -- update references
- `src/lib/validation-schemas.ts` -- remove `buzzMessageSchema` / `validateBuzzText` if unused after changes
- `src/components/WriteReviewDialog.tsx` -- update "Drop a Vibe Check" title

### Files to delete (no longer imported)
- `src/components/DropVibeDialog.tsx`
- `src/components/BuzzItem.tsx`

### Database changes
- Update RLS on `yap_messages`: change SELECT policy from `authenticated` to allow `anon` role (public read)
- Update RLS on `yap_comments`: add public SELECT policy for `anon` role
- No changes to `venue_buzz_messages` table (data stays, just not used by UI anymore)

---

## Detailed Plan

### 1. Database: Make Yap publicly readable

Migration SQL:
```sql
-- Drop existing SELECT policy that requires authenticated
DROP POLICY IF EXISTS "Yap messages viewable by all authenticated users" ON public.yap_messages;

-- Create new public SELECT policy
CREATE POLICY "Yap messages viewable by everyone"
  ON public.yap_messages FOR SELECT
  USING (true);

-- Also make yap_comments publicly readable
-- (need to check existing policies first)
```

The INSERT/DELETE policies still require `auth.uid()`, so posting/voting/deleting remain authenticated-only.

### 2. VenueIdCard: Replace Buzz section with Yap preview

Remove:
- `BuzzItem` and `DropVibeDialog` imports
- `BuzzItemData` interface
- `buzzItems` state, `buzzMediaPhotos` state, `showDropVibe` state
- `fetchBuzzItems()` function
- The entire "Tonight's Buzz" collapsible section (lines ~948-970)
- The `<DropVibeDialog>` render (lines ~1017-1023)

Add:
- A `hotYap` state (`{ text: string; score: number } | null`) fetched from `yap_messages` for the venue
- A `fetchHotYap()` function: query `yap_messages` where `venue_name = venue.name`, not expired, order by `score desc`, limit 1
- A Yap preview row in the venue card (above the "More Info" collapsible):

```
Yap · "DJ is insane right now 🔥" · 72 ↑
```

- Tapping navigates to `/messages` with state `{ activeTab: 'yap', venueName: venue.name }`
- If no yaps exist: `Yap · "No posts yet — be the first"` (tappable, same navigation)

### 3. YapTab: Accept venue prop + unauthenticated browsing

- Add optional `venueName?: string` prop. If provided, use it instead of fetching from `night_statuses`
- Remove the `if (!user) return;` guard in `fetchYapMessages()` -- allow fetching without auth
- For vote fetching (lines 146-158), only run if `user` is present
- For post/vote/comment actions: if `!user`, show a lightweight login prompt (bottom sheet/dialog) with "Create an account to join the conversation" + Sign Up / Log In buttons that navigate to `/auth`
- The realtime subscription can remain auth-gated (non-logged-in users just see static data)

### 4. Messages page: Pass venue context

- When navigating from VenueIdCard, pass `location.state.venueName`
- In `Messages.tsx`, read `location.state?.venueName` and pass it to `<YapTab venueName={venueName} />`

### 5. CheckInConfirmation: Remove Buzz references

- Remove `DropVibeDialog` import and render
- Change copy from "Add to Tonight's Buzz" to "Share what it's like" or navigate to Yap
- The "Share what it's like" button can navigate to `/messages` with `{ activeTab: 'yap', venueName }` instead of opening DropVibeDialog

### 6. Story sharing: Remove Buzz audience option

- `StoryAudienceSheet.tsx`: Remove the `buzz` and `both` radio options. Stories only go to friends. Remove anonymous toggle (was Buzz-only). Remove "Tonight's Buzz" text references.
- `CreateStoryDialog.tsx`: Remove `is_public_buzz` logic. Always set `is_public_buzz: false`. Remove Buzz success messages. Simplify `AudienceOption` type to just visibility levels.

### 7. Cleanup

- Delete `src/components/DropVibeDialog.tsx`
- Delete `src/components/BuzzItem.tsx`
- Remove `validateBuzzText` from `validation-schemas.ts` (only used by DropVibeDialog)
- Update `WriteReviewDialog.tsx` title from "Drop a Vibe Check" to something neutral
- Update `DemoActivator.tsx` and `DemoSettings.tsx` toast/description copy to remove "drop a vibe" references

### 8. Login prompt component

Create a lightweight `LoginPromptSheet` component (bottom sheet):
- "Create an account to join the conversation"
- Two buttons: "Sign Up" and "Log In" -- both navigate to `/auth`
- Used by YapTab when unauthenticated user taps post/vote/comment

---

## Technical Notes

- Yap threads are scoped by `venue_name` (text), not `venue_id`. The VenueIdCard has the venue name, so the preview query uses `venue_name = venue.name`.
- The `venue_buzz_messages` table data remains in the database but is no longer queried by any UI. It can be cleaned up later.
- The `stories.is_public_buzz` column stays in the schema but will always be `false` going forward.
- Making `yap_messages` SELECT public (anon) is safe because yap content is already anonymous and ephemeral. Write operations remain authenticated.

