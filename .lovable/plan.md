

# Redesign Yap Tab — Clarity + Visual Consistency

## Changes — Single File: `src/components/messages/YapTab.tsx`

All changes are visual only. No data, routing, or functionality changes.

### 1. Add Page Header (new section at top of return)
- **"Yap"** title: `text-3xl font-bold text-white` (matches Leaderboard's `text-3xl font-bold text-white mb-1`)
- **Subtitle**: `text-white/60 text-sm` — "Live from the crowd — see what people are saying at venues tonight"
- Appears above everything including the "You're At" card

### 2. "YOU'RE AT" Card Redesign
- Change background from `bg-[#d4ff00]/10` to dark purple gradient: `bg-gradient-to-r from-[#2d1b4e]/80 to-[#1f1338]/60` with `border border-[#a855f7]/20`
- Keep the `YOU'RE AT` label in `text-[#d4ff00]`
- Add subtext under venue name: "Share what's happening" in `text-white/40 text-xs`
- Keep the Post button as-is (neon green-yellow bg with dark text)

### 3. Yap Quotes → Speech Bubble Style
Replace the plain `"quote text"` with styled bubble divs:
- Background: `bg-white/5 rounded-xl px-3 py-2`
- Quote text in `text-white/80 text-sm` (brighter than current `text-white/70`)
- Upvote `▲` count in `text-[#d4ff00]`
- No quotation marks — the bubble container communicates "someone said this"
- Apply this style in both the Hottest card and Active Tonight cards

### 4. "Hottest Right Now" Section
- Add section label `🔥 Hottest Right Now` as a standalone heading above the card (not inside it), styled like the "Active Tonight" heading
- The card itself keeps the gradient/glow styling but quotes use the new bubble style
- Add `ChevronRight` kept as-is for tap indication

### 5. "Active Tonight" Section
- No structural changes, just apply the speech bubble quote style to the `venue.hottest_text` preview
- Existing left border accent, spacing, and count badge are already correct

### 6. Empty State
- No changes needed — already matches the dark theme

### Technical Notes
- Single file edit: `src/components/messages/YapTab.tsx`
- All style values pulled from Leaderboard page for consistency
- No new components, no new imports beyond what exists

