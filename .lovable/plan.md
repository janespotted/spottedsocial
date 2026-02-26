

# Add Timed Posts for Business Yap Messages

## Overview
Add a duration picker to the business compose form, use `expires_at` for message expiry, show live countdowns on the consumer side, and remove the old 24-hour auto-unpin logic.

## Changes

### 1. BusinessYap.tsx — Duration Picker + Remove Auto-Unpin

**Add state**: `duration` with type `'1h' | '2h' | '4h' | 'none'`, default `'none'`.

**Remove lines 62–81** (the 24-hour auto-unpin logic in `fetchMessages`). Replace with just `setMessages(data || [])`.

**Add duration picker UI** below the Pin toggle row — a row of four pill-shaped buttons:
- "1 hour", "2 hours", "4 hours", "Until I remove it"
- Selected pill gets `bg-primary text-black`, unselected gets `bg-white/10 text-white/60`

**Update `handlePost`** to calculate `expires_at`:
- `'1h'` → `new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString()`
- `'2h'` → `new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()`
- `'4h'` → `new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()`
- `'none'` → `null`

Pass `expires_at` in the insert call. Reset `duration` to `'none'` after posting.

**Show expiry on message cards**: If `message.expires_at`, display remaining time like "Expires in 2h 15m" in `text-white/40 text-xs`.

### 2. VenueYapThread.tsx — Expiry Filter + Live Countdown + Remove Auto-Unpin

**Update `fetchPinnedVenueMessages`** (lines 146–176):
- Remove the 24-hour client-side filter (lines 165–169)
- Add expiry filter to the query: `.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())`
- Include `expires_at` in the select fields

**Update `PinnedVenueMessage` interface** to include `expires_at: string | null`.

**Add live countdown**: For pinned messages with `expires_at`, show countdown text like "🔥 {text} — ends in 47 min" styled in `text-[#d4ff00]`. Use a `useEffect` with a 60-second `setInterval` that:
- Recalculates remaining time for each pinned message
- Removes expired messages from `pinnedMessages` state when countdown hits zero

### 3. No Database Migration Needed
The `expires_at` column already exists on `venue_yap_messages` as `timestamptz, nullable, default null`. The RLS policies already filter by `expires_at`.

## Files Modified
- `src/pages/business/BusinessYap.tsx` — duration picker, remove auto-unpin, show expiry on cards
- `src/components/messages/VenueYapThread.tsx` — expiry query filter, live countdown, remove 24h auto-unpin

