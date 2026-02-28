

## Two Fixes

### 1. Venue invite "No valid recipients" — root cause
The `InviteFriendsModal` already filters demo users out of the selectable list when demo mode is off. The second filter inside `sendInvites()` in `VenueInviteContext.tsx` is redundant — it re-fetches all profiles via RPC and re-filters, which can fail due to data/timing mismatches. Since the modal guarantees only valid friends can be selected, remove the redundant demo filtering block from `sendInvites` entirely. Just send invites to whoever was selected.

### 2. Thread header — already fixed
The Thread.tsx header already has `pt-[max(env(safe-area-inset-top),12px)]` applied (confirmed at line 353). No change needed here.

### Files changed
- `src/contexts/VenueInviteContext.tsx` — remove the `if (!demoEnabled) { ... }` filtering block (lines 50-59), just use `selectedFriends` directly as `filteredFriends`

