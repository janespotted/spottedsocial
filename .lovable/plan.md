

# Restyle Yap Feed to Match Newsfeed Aesthetic

## What's wrong now
The Yap feed has neon yellow-green left borders (`border-l-[#d4ff00]`), visible purple outlines (`border-[#a855f7]/20`), and small compact pill toggles that don't match the rest of the app. The Newsfeed uses borderless glass cards (`glass-card rounded-3xl`) with no outlines, and underline-style tabs.

## Changes — Single file: `src/components/messages/YapTab.tsx`

### 1. Hot/New toggle → Underline tabs (matching Newsfeed/Plans toggle at Home.tsx lines 305-328)

Replace the current purple pill buttons (lines 193-217) with the exact same underline tab pattern used on the Home page:

```tsx
<div className="flex items-center gap-6 animate-fade-in">
  <button
    onClick={() => setSortMode('hot')}
    className={`relative pb-2 text-lg font-medium transition-colors ${
      sortMode === 'hot' ? 'text-white' : 'text-white/60'
    }`}
  >
    Hot
    {sortMode === 'hot' && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
    )}
  </button>
  <button
    onClick={() => setSortMode('new')}
    className={`relative pb-2 text-lg font-medium transition-colors ${
      sortMode === 'new' ? 'text-white' : 'text-white/60'
    }`}
  >
    New
    {sortMode === 'new' && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
    )}
  </button>
</div>
```

### 2. Quote cards → Borderless glass cards (lines 242-254)

Strip all borders. Replace with the same `glass-card` pattern the Newsfeed uses:

```tsx
<button
  onClick={() => openThread(quote.venue_name)}
  className={cn(
    'w-full text-left rounded-2xl p-5 relative',
    'bg-white/[0.06] backdrop-blur-sm',
    'active:bg-white/[0.10] transition-all duration-200',
    // #1 post gets extra size
    index === 0 && sortMode === 'hot' && 'p-6'
  )}
>
```

- **Remove**: `border border-[#a855f7]/20` — no visible outlines
- **Remove**: All `border-l-[#d4ff00]` left accent logic (the dynamic width calculation lines 248-252 and the `border-l-[#d4ff00]` on line 252)
- **Add**: More padding (`p-5` instead of `p-4`), bumped to `p-6` for #1 post
- **Keep**: `bg-white/[0.06] backdrop-blur-sm` and `rounded-2xl`

### 3. Quote text styling (line 257)

Default cards: keep `text-[15px] font-medium` — clean and readable.

For #1 post (when sorted by Hot): bump to `text-[17px]` and add a 🔥 next to the upvote count.

```tsx
<p className={cn(
  "text-white font-medium leading-relaxed mb-3",
  index === 0 && sortMode === 'hot' ? 'text-[17px]' : 'text-[15px]'
)}>
  {quote.text}
</p>
```

### 4. Upvote display — #1 post gets 🔥 (lines 273-276)

```tsx
{quote.score > 0 ? (
  <span className="text-[#d4ff00] text-xs font-semibold">
    {index === 0 && sortMode === 'hot' ? '🔥 ' : ''}▲ {quote.score}
  </span>
) : (
  <span />
)}
```

### 5. Card spacing (line 221)

Change `space-y-2` to `space-y-3` for more breathing room between cards (Newsfeed uses `space-y-6` but Yap cards are smaller).

### 6. "You're At" bar (line 186)

Remove the `border border-[#d4ff00]/30` outline to match the borderless theme:
```tsx
className="w-full flex items-center justify-between bg-white/[0.06] backdrop-blur-sm rounded-2xl px-4 py-2.5 active:bg-white/[0.10] transition-colors animate-fade-in"
```

### 7. Group venue headers (lines 231-238)

No change — these are just text labels, not cards.

### 8. Venue line inside cards (lines 262-270)

Keep the 📍 emoji and venue name but change styling to match Newsfeed's venue link:
- Venue name: `text-white font-semibold` (not `/70` opacity)
- Neighborhood: `text-white/40` (keep as-is)

### 9. Empty state (lines 287-288)

Remove border from the icon container: change `border border-[#a855f7]/20` to just the bg.

## What stays the same
- All data fetching, sorting logic, state management
- Thread navigation (tapping cards → openThread)
- Title "Yap" and subtitle
- Venue group detection logic
- Loading skeleton
- VenueYapThread (not touched in this change — thread view is a separate concern)

## Summary of removals
- All `border-l-[#d4ff00]` left accents on cards
- All `border border-[#a855f7]/20` outlines on cards
- `border border-[#d4ff00]/30` on "You're At" bar
- Purple pill toggles → underline tabs
- `border border-[#a855f7]/20` on empty state icon

