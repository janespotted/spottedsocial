

# Redesign Yap Tab as Browsable Venue Directory

## Current State
The YapTab component (`src/components/messages/YapTab.tsx`, 1014 lines) currently shows a single venue's Yap thread. It determines the venue either from a `venueName` prop (from navigation state) or by looking up the user's `night_statuses` record. If neither exists, it shows "Yap unlocks when you arrive." All logic — posting, voting, comments, moderation — lives in this one component.

The `yap_messages` table has `venue_name` as the venue key, with `score`, `comments_count`, `expires_at`, `text`, `user_id`, etc.

## Architecture

Split the current monolithic `YapTab` into two views with internal navigation:

1. **YapTab** (refactored) — The venue directory/listing view
2. **VenueYapThread** (new component) — The existing Yap thread view, extracted and enhanced with read-only mode

### Internal state machine in YapTab:
- `view: 'directory' | 'thread'` + `threadVenueName: string | null`
- When `venueName` prop is provided (from venue card navigation), go directly to thread view
- Back button from thread returns to directory view

## Detailed Changes

### File: `src/components/messages/VenueYapThread.tsx` (NEW)
Extract all the existing Yap thread logic (lines 58-1014 of current YapTab) into this new component. Props:
```typescript
interface VenueYapThreadProps {
  venueName: string;
  canPost: boolean; // true only if user is checked into THIS venue
  onBack: () => void; // return to directory
}
```

Key changes from current behavior:
- Accept `canPost` prop instead of always showing the post input
- When `canPost` is false, replace the post input area with a bar: "📍 Check in here to post" with a tooltip on tap explaining you must be physically present
- Voting and commenting remain available to all authenticated users regardless of `canPost`
- Unauthenticated users see login prompt for vote/comment/post actions (existing behavior)
- Add a back arrow button at the top next to the venue name header
- Keep ALL existing functionality: anonymous posting, New/Hot sort, upvote/downvote, 280 char limit, "..." moderation menu, auto-hide at -8, cooldown, media upload, comments, blocked users

### File: `src/components/messages/YapTab.tsx` (REFACTORED)
Completely new top-level structure with two states:

**State 1: Directory view** (`view === 'directory'`)

Query `yap_messages` to get all venues with active yaps tonight:
```sql
SELECT venue_name, 
       COUNT(*) as post_count, 
       MAX(score) as top_score
FROM yap_messages 
WHERE expires_at > now() 
  AND is_demo = false
GROUP BY venue_name 
ORDER BY COUNT(*) DESC
```

Also look up the user's current venue from `night_statuses` to determine check-in state.

For each venue with yaps, also fetch the hottest post text (highest score) for the preview line.

For venue metadata (type, neighborhood), join with `venues` table by name matching.

Layout:
1. **"Your Venue" card** (conditional — only if user has a `night_statuses` record with a `venue_name`):
   - "You're at [Venue Name]" with a prominent "Post" button
   - Tapping opens that venue's thread with `canPost=true`

2. **"Active Tonight 🔥" section**:
   - Scrollable list of venue cards, each showing:
     - Venue name (bold)
     - Venue type + neighborhood (from venues table, e.g. "Bar · Silver Lake")
     - Post count ("12 posts")
     - One-line preview of hottest post (truncated)
     - ChevronRight indicator
   - Tapping opens that venue's thread with `canPost` = true only if user is checked into that specific venue

3. **Empty state**: "No Yap yet tonight. Be the first to post when you're out! 🎤"

**State 2: Thread view** (`view === 'thread'`)
- Renders `<VenueYapThread venueName={threadVenueName} canPost={isCheckedInHere} onBack={goBackToDirectory} />`

When `venueName` prop is provided (from venue card / map navigation):
- Skip directory, go straight to thread view
- Back button returns to directory (not navigate(-1), since we want to stay in the Yap tab)

### Venue data enrichment
To show "Bar · Silver Lake" on the directory cards, query the `venues` table for matching venue names. This is a simple client-side join since venue names map 1:1 to venue records.

## Files Modified
1. `src/components/messages/VenueYapThread.tsx` — **NEW** — extracted thread component (~700 lines, moved from YapTab)
2. `src/components/messages/YapTab.tsx` — **REWRITTEN** — directory + routing shell (~250 lines new code, delegates to VenueYapThread)

## What Stays Untouched
- All Yap thread internals: anonymous posting, New/Hot sorting, upvote/downvote, 280 char limit, "..." report menu, auto-hide at -8, 60-second cooldown, media uploads, comments, blocked users
- Yap preview on venue cards (VenueIdCard.tsx)
- Position of Yap as sub-tab under Messages
- Messages.tsx navigation/tab structure
- Database schema — no migrations needed, existing `yap_messages` table supports all queries
- All other components and pages

