

# Restyle Find Friends to Match Map Friends List

## Two Changes

### 1. Restyle FriendSearchModal results (FriendSearchModal.tsx)

Replace the flat unsectioned list with grouped sections matching the map's friends panel:

**Container**: `bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg` — identical to the map panel.

**Section headers** — split filtered results into "out", "planning", and "home" groups with headers:
- "👥 Friends Out Now" — `text-white/70 text-xs font-semibold uppercase tracking-wider`
- "🔥 Friends Planning 🎯" — same style, inside a `bg-[#1a0f2e]/50 border-y border-[#a855f7]/20` divider bar (matches map exactly)
- Home friends shown without a header, just listed below

**Row styling** — pixel-match the map list rows:
- Row: `w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10`
- Avatar: `w-10 h-10 border-2 border-[#a855f7]/50` with `bg-[#a855f7] text-white text-sm` fallback
- Name: `text-white font-semibold text-sm truncate`
- Out subtitle: `text-[#d4ff00] text-xs` with `📍 At {venue}` (matches map)
- Planning subtitle: `text-[#a855f7] text-xs` with `🎯 Planning (neighborhood)` (matches map)
- Home subtitle: `text-white/40 text-xs` showing "Home"
- Remove the story ring, status badge pills, and `@username` line — the map list doesn't have these

**Search bar**: Keep exactly as-is at the top. Filters across all groups in real-time.

**Drawer background**: Change to `bg-[#1a0f2e]` to match the map panel's dark purple tone.

### 2. Add search icon to all pages with a bell icon

Currently the search icon + FriendSearchModal only exists on `Home.tsx`. The user wants it "visible across all pages where the activity bell is."

Pages with the bell icon: **Home, Feed, Profile, Leaderboard, Messages, Map**.

Home already has it. For the other 5 pages, add:
- Import `Search` from lucide-react, `FriendSearchModal` component, and `useState`
- Add `const [showFriendSearch, setShowFriendSearch] = useState(false)` state
- Add a search icon button (same style as Home's) to the left of the bell icon in each header
- Render `<FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />` in each page

Pages to modify:
- `src/pages/Feed.tsx`
- `src/pages/Profile.tsx`
- `src/pages/Leaderboard.tsx`
- `src/pages/Messages.tsx`
- `src/pages/Map.tsx`

## Files Modified
- `src/components/FriendSearchModal.tsx` — restyle results to match map panel
- `src/pages/Feed.tsx` — add search icon + modal
- `src/pages/Profile.tsx` — add search icon + modal
- `src/pages/Leaderboard.tsx` — add search icon + modal
- `src/pages/Messages.tsx` — add search icon + modal
- `src/pages/Map.tsx` — add search icon + modal

