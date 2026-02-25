

# Polish Yap Tab + Thread to Match App Aesthetic

The Yap directory (empty state) already looks consistent with the app. The main issues are:

1. **Yap directory feed cards** — the `bg-gradient-to-r from-[#2d1b4e]/80 to-[#1f1338]/60` gradient and explicit `border-[#a855f7]/15` look slightly different from every other card in the app, which uses `bg-[#2d1b4e]/60 border border-[#a855f7]/20` or `bg-white/[0.06] backdrop-blur-sm` (PlanItem). The gradient makes it feel "custom" rather than cohesive.

2. **Sort pills** use `rounded-full` which contradicts the design system (pills reserved for impulsive CTAs, small UI should be `rounded-xl` or `rounded-lg`).

3. **VenueYapThread** message cards have inconsistent styling — the `border-l-[3px] border-l-[#d4ff00]` accent is fine but combined with `bg-[#2d1b4e]/60 border border-[#a855f7]/20` looks cluttered with two border colors.

4. **Thread header** is plain — no glassmorphism or backdrop blur like the rest of the app.

## Changes

### File 1: `src/components/messages/YapTab.tsx`

**Quote card styling** (lines 244-254): Replace the gradient background with the standard card pattern used across the app:
- Change `bg-gradient-to-r from-[#2d1b4e]/80 to-[#1f1338]/60` to `bg-white/[0.06] backdrop-blur-sm`
- Change `border border-[#a855f7]/15` to `border border-[#a855f7]/20`
- Keep the dynamic `border-l-[#d4ff00]` left accent — it's the signature Yap element

**Sort toggles** (lines 194-217): Change `rounded-full` to `rounded-xl` on both pills to follow the design system (small UI = rounded-xl, pills = CTAs only).

**Empty state icon** (line 288): The purple circle with mic icon looks good, no change needed.

**"You're At" bar** (line 186): Change `rounded-xl` to `rounded-2xl` to match card radius used elsewhere.

### File 2: `src/components/messages/VenueYapThread.tsx`

**Venue header area** (lines 449-459): Wrap in a subtle glass card background to give it more weight:
- Add `bg-white/[0.04] rounded-2xl px-4 py-3` to the header container
- This matches how the Home page treats section headers with subtle card backgrounds

**Sort tabs** (lines 462-481): Change `rounded-full` to `rounded-xl` to match feed pills and design system.

**Message cards** (line 557): Align with the feed card pattern:
- Change `bg-[#2d1b4e]/60 border border-[#a855f7]/20` to `bg-white/[0.06] backdrop-blur-sm border border-[#a855f7]/20`
- Keep `border-l-[3px] border-l-[#d4ff00]` accent

**Buried card** (line 549): Same treatment — `bg-white/[0.04]` instead of `bg-[#2d1b4e]/30`.

**Post input area** (line 485): Change `bg-[#2d1b4e]/60` to `bg-white/[0.06] backdrop-blur-sm` for consistency.

**"Head here to post" bar** (line 529): Same — `bg-white/[0.06]` instead of `bg-[#2d1b4e]/60`.

**Comment area backgrounds** (line 593): Change `bg-[#1a0f2e]/60` to `bg-white/[0.04]` for comment bubbles.

**Empty state** (line 644): Change `bg-[#2d1b4e]/60` to `bg-white/[0.06]` on the icon container.

### Technical Notes
- `bg-white/[0.06] backdrop-blur-sm` is the pattern used by `PlanItem` (`bg-white/[0.06] backdrop-blur-sm rounded-2xl`) — the most modern-looking card in the app
- This creates a frosted glass effect that feels premium and cohesive
- No structural, data, or logic changes — purely CSS class swaps
- No new dependencies

### Summary

| File | Changes |
|------|---------|
| `YapTab.tsx` | Card bg → `bg-white/[0.06]`, sort pills → `rounded-xl`, "You're At" → `rounded-2xl` |
| `VenueYapThread.tsx` | All cards/inputs → `bg-white/[0.06]`, header gets glass bg, sort pills → `rounded-xl`, comment bubbles → `bg-white/[0.04]` |

