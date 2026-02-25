

# Remove Left Border/Accent from Yap Cards

## Problem
The `VenueYapThread.tsx` file has cards with a visible neon yellow-green left border (`border-l-[3px] border-l-[#d4ff00]`) and a purple outline (`border border-[#a855f7]/20`). These need to be stripped to match the borderless glass-card aesthetic already applied to the YapTab directory feed.

## Change: `src/components/messages/VenueYapThread.tsx` line 558

Current:
```tsx
className={cn("bg-white/[0.06] backdrop-blur-sm border border-[#a855f7]/20 rounded-2xl p-4 border-l-[3px] border-l-[#d4ff00]", ...)}
```

Replace with:
```tsx
className={cn("bg-white/[0.06] backdrop-blur-sm rounded-2xl p-4", ...)}
```

Removes `border border-[#a855f7]/20 border-l-[3px] border-l-[#d4ff00]` -- all border classes. Cards will be clean rounded dark cards with no visible borders, matching the YapTab directory feed cards.

## What stays the same
- Card content, layout, padding, rounded corners
- All interactivity (voting, comments, moderation)
- The buried post card styling (line 550) -- separate element, not affected

