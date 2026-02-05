

## Premium Minimalist Promoted Venue Markers

### Current State Analysis

The current promoted venue styling uses:
- Harsh yellow-green gradient background (`linear-gradient(135deg, #a855f7, #d4ff00)`)
- Yellow border ring (`#d4ff00`)
- Bright yellow star badge (⭐) on the corner
- Fast pulse animation (1.5s) with high opacity yellow glow

**Problems:**
- Star badge feels promotional/gamey
- Gradient background is too loud against the dark map
- Fast pulse is attention-demanding rather than ambient
- Border + star + glow = visual clutter

---

### Design Philosophy

Inspired by Apple Maps' understated elegance:
- Use **light** as the indicator, not decoration
- Animation should feel like a **breathing heartbeat**, not a flashing alert
- Promoted status should be **felt, not screamed**
- Integration with Spotted's signature neon yellow-green (`#d4ff00`) but at reduced intensity

---

### Option A: Soft Halo Glow

A gentle ambient halo emanating from beneath the standard venue pin.

**Visual:**
```text
       ╭─────────╮
      ╱           ╲     ← Soft radial gradient
     │   ┌─────┐   │       (8% opacity yellow-green)
     │   │  📍  │   │
     │   └─────┘   │    ← Standard purple pin
      ╲           ╱
       ╰─────────╯
```

**Key Characteristics:**
- Standard purple pin shape (same as non-promoted)
- Soft radial gradient halo: `radial-gradient(circle, rgba(212, 255, 0, 0.12) 0%, transparent 65%)`
- Slow breathing animation: 4s cycle, subtle scale shift (1.0 to 1.08)
- No badge, no border change
- Halo size: 70px container for 38px pin

**Animation Keyframes:**
```css
@keyframes promoted-breathe {
  0%, 100% { 
    opacity: 0.7; 
    transform: scale(1); 
  }
  50% { 
    opacity: 1; 
    transform: scale(1.08); 
  }
}
```

---

### Option B: Thin Neon Ring

A subtle luminescent ring around the standard pin.

**Visual:**
```text
        ╭─────╮
       ╱┌─────┐╲     ← 1.5px glowing ring
      │ │  📍  │ │      (40% opacity yellow-green)
       ╲└─────┘╱
        ╰─────╯
```

**Key Characteristics:**
- Standard purple pin interior
- Thin ring: `1.5px solid rgba(212, 255, 0, 0.45)`
- Outer glow: `box-shadow: 0 0 8px rgba(212, 255, 0, 0.25)`
- Slow fade animation: 3.5s cycle, opacity oscillates 0.35 to 0.55
- Pin size unchanged from standard (38px)

**Animation Keyframes:**
```css
@keyframes promoted-ring-pulse {
  0%, 100% { 
    box-shadow: 0 0 6px rgba(212, 255, 0, 0.2);
    border-color: rgba(212, 255, 0, 0.35);
  }
  50% { 
    box-shadow: 0 0 12px rgba(212, 255, 0, 0.35);
    border-color: rgba(212, 255, 0, 0.55);
  }
}
```

---

### Option C: Subtle Surface Pulse

A glow that appears to emanate from the map surface beneath the pin.

**Visual:**
```text
     ┌─────┐
     │  📍  │      ← Standard purple pin
     └──┬──┘
   ~~~~│~~~~       ← Expanding/fading circles
  ~~~~~│~~~~~         on map surface
```

**Key Characteristics:**
- Standard purple pin (unchanged)
- Concentric circles expanding outward from pin base
- Color: `rgba(212, 255, 0, 0.15)` fading to transparent
- Animation: 5s cycle, circles expand to 2x size then fade
- Creates "ripple" effect suggesting activity

**Animation Keyframes:**
```css
@keyframes promoted-surface-ripple {
  0% { 
    transform: scale(0.8); 
    opacity: 0.25; 
  }
  50% { 
    transform: scale(1.4); 
    opacity: 0.1; 
  }
  100% { 
    transform: scale(2); 
    opacity: 0; 
  }
}
```

---

### Venue Card Treatment (All Options)

When tapped, the promoted venue card should feel elevated:

**Entry Animation:**
- Smooth rise: `translateY(20px) → translateY(0)` over 350ms
- Subtle scale: `scale(0.97) → scale(1)`
- Easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` (slight bounce)

**Promoted Label:**
- Text: "Featured Tonight" (not "Promoted" or "Sponsored")
- Placement: Small pill above venue name
- Styling: `bg-[#d4ff00]/10 text-[#d4ff00] text-[10px] font-medium`
- Border: `border border-[#d4ff00]/20 rounded-full px-2 py-0.5`

**Card Accent:**
- Subtle top border gradient: `linear-gradient(90deg, transparent 0%, rgba(212,255,0,0.3) 50%, transparent 100%)`
- Very slight card glow: `box-shadow: 0 0 30px rgba(212,255,0,0.08)`

---

### Recommended Approach: Option A (Soft Halo Glow)

**Rationale:**
- Most subtle and Apple-like
- Integrates naturally with friend avatars (doesn't compete visually)
- Breathing animation feels organic and nightlife-appropriate
- Avoids any badge/ring that could feel promotional
- Halo effect suggests "hot spot" without screaming "ad"

---

### File Changes

**1. `src/pages/Map.tsx`** (Lines ~835-855)
- Remove star badge element
- Replace gradient background with solid purple
- Add soft halo div behind pin
- Change animation to slow breathing (4s)
- Reduce glow intensity significantly

**2. `src/index.css`**
- Add new keyframes for `promoted-breathe` animation
- Add `.promoted-halo` utility class

**3. `src/components/VenueIdCard.tsx`**
- Add "Featured Tonight" pill for promoted venues
- Add subtle top border accent
- Enhance card entry animation

---

### Visual Comparison

| Aspect | Current | Proposed |
|--------|---------|----------|
| Pin color | Yellow-purple gradient | Solid purple (matches others) |
| Border | 2px yellow | 1.5px white (matches others) |
| Badge | ⭐ corner star | None |
| Glow | Bright yellow pulse (1.5s) | Soft halo breathe (4s) |
| Halo opacity | 40% | 12% |
| Animation speed | Fast (1.5s) | Slow ambient (4s) |
| Card label | None | "Featured Tonight" pill |

