

# Polish Yap Feed Cards + Yap Thread Visual Consistency

Two areas to address: the three specific tweaks to the Yap feed cards, and improving the Yap thread (VenueYapThread) to match the app's visual style better.

## File 1: `src/components/messages/YapTab.tsx`

### 1. Remove Quotation Marks
Line 255: Change `"{quote.text}"` to `{quote.text}` — remove the wrapping quote characters.

### 2. Bold Venue Name
Lines 236-237 (group header) and 264-265 (inline venue line): Split the venue name and neighborhood into separate spans. Venue name gets `font-semibold text-white/70`, neighborhood stays `text-white/40`.

### 3. Dynamic Left Border Thickness
Lines 248-249: Replace the static `border-l-[3px]` / `border-l-[4px]` with a computed thickness based on `quote.score`. Logic:
- score <= 0: `border-l-[2px]`
- score 1-10: `border-l-[3px]`
- score 11-30: `border-l-[4px]`
- score 31+: `border-l-[5px]`
For grouped cards, add 1px to each tier.

## File 2: `src/components/messages/VenueYapThread.tsx`

### Visual Polish to Match App Style
The thread view currently looks functional but "cheap" compared to the rest of the app. Changes:

**Venue header** (line 455): Change from `text-[#d4ff00]` to `text-white` with a subtle venue type badge, and add a small `text-white/50` subtitle line.

**Sort tabs** (lines 459-474): Restyle to match the Yap feed's pill toggles — smaller, `rounded-full`, with the same active/inactive colors (`bg-[#d4ff00]/20 text-[#d4ff00]` active, `bg-white/5 text-white/40` inactive). Currently they're large bordered buttons that look inconsistent.

**Message cards** (line 550): Add a subtle left border accent `border-l-[3px] border-l-[#d4ff00]` to each message card to match the feed cards. Keep the existing background and padding.

**Post input area** (lines 478-517): No changes needed — already styled correctly.

**"Head here to post" bar** (lines 518-531): No changes needed.

### Summary

| File | Changes |
|------|---------|
| `src/components/messages/YapTab.tsx` | Remove quotes, bold venue name, dynamic border thickness |
| `src/components/messages/VenueYapThread.tsx` | Restyle sort tabs to match feed pills, add left border accent to message cards, refine venue header |

