

# Remove Stories + Tonight's Buzz

Stories and Tonight's Buzz clips are being removed. Yap handles all venue-level content now. The `stories` and `story_views` tables stay in the database (no data deletion), but all UI references are stripped out.

## Files to Delete

| File | Reason |
|------|--------|
| `src/components/CreateStoryDialog.tsx` | Story creation flow |
| `src/components/StoryViewer.tsx` | Story viewing UI |
| `src/components/StoryEditor.tsx` | Canvas-based text/emoji overlay editor |
| `src/components/StoryCaptureScreen.tsx` | Camera capture for stories |
| `src/components/StoryAudienceSheet.tsx` | Audience selector sheet |
| `src/components/PhotoFilterScreen.tsx` | Photo filter (only used by stories) |
| `src/components/WriteReviewDialog.tsx` | "Drop a Vibe" dialog — not imported anywhere, dead code |

## Files to Edit

### `src/pages/Feed.tsx`
- Remove imports: `StoryViewer`, `CreateStoryDialog`
- Remove state: `selectedStoryUser`, `createStoryOpen`
- Remove the entire "Your Story" button + "Friend Stories" row (lines ~195-259)
- Remove `StoryViewer` and `CreateStoryDialog` render blocks (lines ~561-578)
- Remove `storyUsers`, `userHasStory`, `fetchStories` from `useFeed` destructuring
- Remove `fetchStories` from PullToRefresh callback
- Keep everything else (posts, FAB, etc.)

### `src/pages/Home.tsx`
- Same story removal as Feed.tsx: imports, state, story row UI, viewer/dialog renders
- Remove `storyUsers`, `userHasStory`, `fetchStories` references
- Keep the rest of the newsfeed/planning mode UI

### `src/components/FriendIdCard.tsx`
- Remove `StoryViewer` import
- Remove `hasStory`, `showStoryViewer` state
- Remove `checkForStories`, `handleViewStory` functions
- Remove the story ring conditional on the avatar (simplify to always show the relationship-colored border)
- Remove the `StoryViewer` render block at the bottom

### `src/hooks/useFeed.ts`
- Remove `StoryUser` interface export
- Remove `storyUsers`, `userHasStory` state
- Remove `onCacheStories`, `getCachedStories` from options interface
- Remove entire `fetchStories` function (~100 lines)
- Remove `storyUsers`, `userHasStory`, `fetchStories` from return object

### `src/hooks/useOfflineCache.ts`
- Remove `STORIES` cache key
- Remove `cacheStories`, `getCachedStories` functions and exports

### `src/pages/DemoSettings.tsx`
- Remove the "Yaps + Buzz" label → change to just "Yaps"
- Remove the "Drop a Vibe" test section if it exists as a distinct block

### `supabase/functions/delete-account/index.ts`
- Keep `stories` and `story_views` in the cleanup list (still want to delete user data on account deletion even though the feature is removed from UI)

## What Stays Untouched
- Database tables (`stories`, `story_views`, `venue_buzz_messages`) — no migrations, no data loss
- Yap system (VenueYapThread, YapTab, yap_messages)
- Posts feed
- VenueIdCard (already uses Yap, not Buzz)
- All other features

## Technical Notes
- The `stories` table `is_public_buzz` column was the bridge between Stories and Tonight's Buzz. With both removed, this becomes inert.
- `venue_buzz_messages` table exists but has no UI references in the current codebase (VenueIdCard already switched to Yap). It stays as-is.
- No breaking changes — all removed code is self-contained in the story components.

