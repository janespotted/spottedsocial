

# Restyle Hot/New Toggle Pills — Premium Purple Treatment

The current toggles use `bg-[#d4ff00]/20` (yellow-green tint) which clashes with the app's purple-dominant design system. Every other interactive element in the app uses `#a855f7` purple — buttons, badges, borders, highlights. The yellow-green should be reserved for the left-border accent on cards (the "heat" indicator), not for UI controls.

## Design

**Active pill**: Solid purple fill with subtle glow — `bg-[#a855f7] text-white font-semibold shadow-[0_0_12px_rgba(168,85,247,0.4)]` — feels like a lit-up button.

**Inactive pill**: Ghost style — `bg-transparent border border-white/15 text-white/40` — recedes visually, clearly tappable but not competing.

**Shape**: `rounded-lg` (8px) per the radius system (small UI elements = rounded-lg/xl, not pill-shaped). Compact sizing: `px-3 py-1 text-xs`.

**Remove emojis**: The 🔥 and 🕐 emojis add visual noise. Replace with clean text: "Hot" and "New".

## File 1: `src/components/messages/YapTab.tsx` (lines 194-217)

Replace sort toggle block:
```tsx
<div className="flex gap-2 animate-fade-in">
  <button
    onClick={() => setSortMode('hot')}
    className={cn(
      'px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200',
      sortMode === 'hot'
        ? 'bg-[#a855f7] text-white shadow-[0_0_12px_rgba(168,85,247,0.4)]'
        : 'bg-transparent border border-white/15 text-white/40 hover:text-white/60'
    )}
  >
    Hot
  </button>
  <button
    onClick={() => setSortMode('new')}
    className={cn(
      'px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200',
      sortMode === 'new'
        ? 'bg-[#a855f7] text-white shadow-[0_0_12px_rgba(168,85,247,0.4)]'
        : 'bg-transparent border border-white/15 text-white/40 hover:text-white/60'
    )}
  >
    New
  </button>
</div>
```

## File 2: `src/components/messages/VenueYapThread.tsx` (lines 462-482)

Same treatment — replace the sort tabs with identical styling to maintain consistency between feed and thread views.

## What stays the same
- Card backgrounds, borders, layout, spacing
- The `border-l-[#d4ff00]` heat accent on quote cards (that's the correct use of yellow-green)
- All data fetching, sorting logic, navigation
- Everything else on the page

