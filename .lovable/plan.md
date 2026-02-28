

## Align Invite Friends Modal with Who's Out Formatting

**Problem**: The Invite Friends modal uses a simpler status fetch (just `night_statuses` without expiry filtering or `checkins` check), so all friends appear under "Other Friends" with no status info. The Who's Out sheet has a more robust status resolution and better visual formatting.

### Changes to `src/components/InviteFriendsModal.tsx`

1. **Fix status fetching** — mirror the FriendSearchModal logic:
   - Query both `checkins` (active, `ended_at IS NULL`) and `night_statuses` (with `expires_at > now()` filter)
   - Resolve status: active check-in → "out", night_status "out" → "out", night_status "planning" → "planning", else "home"

2. **Match visual formatting** — adopt FriendSearchModal's row style:
   - Status sub-text: yellow `📍 At {venue}` for out, purple `🎯 Planning` for planning, gray "Home" for home
   - Same row layout with `border-b border-[#a855f7]/10` instead of individual card backgrounds
   - Section headers: `👥 Friends Out Now`, `🔥 Friends Planning 🎯`, `Staying In` — matching Who's Out exactly

3. **Remove Collapsible sections** — replace with static grouped sections (matching Who's Out flat list style) wrapped in the same `bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg` container

### Files changed
- `src/components/InviteFriendsModal.tsx`

