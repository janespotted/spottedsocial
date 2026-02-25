

# Fix Comments Access + Gate Posting/Commenting to Checked-In Users

## Two Issues

### Issue 1: Comments not accessible despite showing count
The comment toggle at line 583 calls `handleToggleComments(msg.id)` which sets `expandedYapId` and fetches comments. The comments section renders at line 589 when `expandedYapId === msg.id`. This logic looks correct, so the issue is likely that the comment input area and comments render but comments may fail to load. However, looking more closely — the comment section (lines 611-624) shows the input field regardless of `canPost`. The user may be tapping the comment input area (which looks interactive) but nothing happens because they're not at the venue. This leads to the second issue naturally.

### Issue 2: Gate posting and commenting to checked-in users only
Currently `canPost` is passed as a prop but only controls the main post input area (lines 484-538). The comment input (lines 611-624) and `handlePostComment` have no `canPost` check. Need to:
- Replace the comment input with "Head here to post" when `!canPost`
- Block `handlePostComment` when `!canPost`
- Keep voting (up/down on comments and messages) available to everyone

## Changes — Single File: `src/components/messages/VenueYapThread.tsx`

### Comment input gating (lines 611-624)
Replace the comment input + send button with a conditional:
- If `canPost`: show the existing input + send button (unchanged)
- If `!canPost`: show a compact "📍 Head here to comment" bar matching the existing "Head here to post" style (smaller version, inline within the comments section)

```tsx
{canPost ? (
  <div className="flex gap-2">
    <input ... />
    <Button ... />
  </div>
) : (
  <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2">
    <MapPin className="h-4 w-4 text-[#d4ff00] shrink-0" />
    <span className="text-white/50 text-sm">📍 Head here to comment</span>
  </div>
)}
```

### handlePostComment guard (line 414)
Add `if (!canPost) return;` at the top of `handlePostComment` as a safety check.

### No other changes
- Voting on messages and comments stays open to all logged-in users
- Reading/expanding comments stays open to everyone
- The main post input area already gates on `canPost` correctly
- Thread navigation, sorting, moderation all unchanged

