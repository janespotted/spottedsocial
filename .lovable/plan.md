

## Add Layer Visibility Toggle (Friends/Venues) While Keeping Venue Type Filter

### Problem
Friend avatars and venue pins overlap when many are in the same area. Users need a way to focus on just friends or just venues without losing the existing venue type filter functionality.

### Solution
Add a **secondary layer toggle** that controls marker visibility, completely separate from the venue type filter. Users will have two filter controls:
1. **Venue Type Filter** (existing) - Filter by venue type (All, Clubs, Cocktails, Bars, Rooftops)
2. **Layer Toggle** (new) - Show Both / Friends Only / Venues Only

---

### UI Design

The controls will be arranged as:

```text
┌────────────────────────────┐
│  Left side    │  Right side │
├────────────────────────────┤
│  🔍 Search    │  🗺️ All Venues ▼  <- Existing venue type filter
│  📍 Explore   │  [Both|👤|📍]      <- NEW layer toggle
└────────────────────────────┘
```

The new toggle appears below the venue type filter as a compact 3-segment pill:
- **Both** (default) - Shows friends + venues
- **👤** (Friends) - Shows only friend avatars
- **📍** (Venues) - Shows only venue pins

---

### Technical Implementation

**File: `src/pages/Map.tsx`**

**1. Add new state (around line 89):**
```typescript
const [layerVisibility, setLayerVisibility] = useState<'both' | 'friends' | 'venues'>('both');
```

**2. Modify friend marker rendering (lines 605-759):**
- Add early return when `layerVisibility === 'venues'`
- Clear existing friend markers when switching to venues-only mode

**3. Modify venue marker rendering (lines 788-897):**
- Add early return when `layerVisibility === 'friends'`
- Clear existing venue markers when switching to friends-only mode

**4. Add layer toggle UI (after line 1179, below venue type filter):**
```tsx
{/* Layer Visibility Toggle */}
<div 
  className={`absolute right-4 z-[200] transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
  style={{ top: 'calc(9.5rem + env(safe-area-inset-top, 0px))' }}
>
  <div className="flex bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-xl overflow-hidden">
    <button
      onClick={() => setLayerVisibility('both')}
      className={`px-3 py-2 text-sm transition-colors ${
        layerVisibility === 'both' 
          ? 'bg-[#a855f7]/30 text-[#d4ff00]' 
          : 'text-white/70 hover:bg-[#a855f7]/15'
      }`}
    >
      Both
    </button>
    <button
      onClick={() => setLayerVisibility('friends')}
      className={`px-3 py-2 text-sm transition-colors ${
        layerVisibility === 'friends' 
          ? 'bg-[#a855f7]/30 text-[#d4ff00]' 
          : 'text-white/70 hover:bg-[#a855f7]/15'
      }`}
    >
      👤
    </button>
    <button
      onClick={() => setLayerVisibility('venues')}
      className={`px-3 py-2 text-sm transition-colors ${
        layerVisibility === 'venues' 
          ? 'bg-[#a855f7]/30 text-[#d4ff00]' 
          : 'text-white/70 hover:bg-[#a855f7]/15'
      }`}
    >
      📍
    </button>
  </div>
</div>
```

**5. Conditional rendering for related UI elements:**
- Hide "X friends out" pill when `layerVisibility === 'venues'`
- Hide relationship legend when `layerVisibility === 'venues'`
- Disable/gray out venue type filter when `layerVisibility === 'friends'`

**6. Close modals on layer switch:**
- When switching to venues-only, close `selectedCluster` popover (friend clusters)
- When switching away from venues-only, the venue type filter becomes active again

---

### Behavior Summary

| Mode | Friend Avatars | Venue Pins | Friends List | Venue Filter | Legend |
|------|----------------|------------|--------------|--------------|--------|
| Both (default) | Visible | Visible | Active | Active | Visible |
| Friends Only | Visible | Hidden | Active | Disabled | Visible |
| Venues Only | Hidden | Visible | Hidden | Active | Hidden |

---

### Files to Modify
- `src/pages/Map.tsx` only

---

### Edge Cases Handled
- Search still works in all modes (finds venues for navigation)
- Explore Venues list still works in all modes (for discoverability)
- User location marker remains visible in all modes
- Cluster popovers only appear when friends are visible
- Switching modes clears irrelevant UI state (e.g., close friend cluster popover when hiding friends)

