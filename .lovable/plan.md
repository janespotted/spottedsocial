

## Fix: Logo Black Background — Use CSS Mask Instead of Blend Mode

### Root Cause
`mix-blend-mode: screen` fails inside **isolation contexts** — any parent with `backdrop-filter`, `transform`, `opacity`, or `will-change` creates one. The bottom nav uses `backdrop-blur-lg`, the check-in modal uses transforms, etc. This is why the black square persists.

### Solution
Replace the blend-mode approach with **CSS masking**. The logo is a bright golden "S" on a solid black background — perfect for `mask-image` with `luminance` mode, where bright pixels become opaque and black pixels become transparent. This works regardless of stacking context.

### Changes

**`src/index.css`** — Replace the `.logo-blend` rule:
```css
/* Logo transparency — mask-based, works in all stacking contexts */
.logo-blend {
  mask-image: url(var(--logo-self));
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-image: url(var(--logo-self));
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}
```

Wait — `mask-image` on an `<img>` using `luminance` still shows the image pixels, not a solid fill. That won't work directly.

**Better approach**: Since the logo is golden on black, and we want the golden "S" with no background, the cleanest CSS-only fix is to **add `isolation: auto` override** on the logo itself AND ensure blend mode propagates. But that still won't work through `backdrop-filter`.

**Actual best fix**: Change the `.logo-blend` class to use **`background-blend-mode`** combined with rendering the image as a `background-image` instead of an `<img>` tag. But that's 18 files of JSX changes.

**Simplest bulletproof fix**: The PNG itself has a black background. No CSS trick reliably removes this in all contexts. We need to **replace the asset with a version that has a transparent background**. Since we can't edit the PNG, we'll render the logo as an inline SVG or use a `<div>` with the image as a CSS mask to create a solid-color "S" shape.

### Final approach — CSS mask on a div

Replace every `<img src={spottedLogo} className="... logo-blend" />` with a `<div>` that uses the image as a mask, showing a solid golden gradient fill:

This is too many file changes. Instead:

### Revised approach — `isolation: isolate` removal won't work. Use `filter` trick.

Actually the simplest approach: **Use `mix-blend-mode: screen` but add `isolation: auto !important`** won't help since the isolation is on the parent, not the logo.

### Final Plan

**Replace the PNG asset** with a clean version. We'll create a simple inline SVG component for the Spotted S logo that renders with true transparency, eliminating the problem entirely. This is a one-component change + update all 18 import sites.

**`src/components/SpottedLogo.tsx`** — New component that renders the S as an SVG with transparent background, matching the golden color from the current PNG.

**All 18 files** — Replace `import spottedLogo` + `<img src={spottedLogo}>` with `import { SpottedLogo }` + `<SpottedLogo className="..." />`.

### Detailed changes

1. **Create `src/components/SpottedLogo.tsx`** — An SVG component that draws the golden "S" shape with no background. Accepts `className` prop for sizing. The S will use a gold gradient (`#c4a052` to `#e8d48b`) matching the current asset.

2. **Update all 18 files** — Replace the PNG image element with the new component. The `logo-blend` class is no longer needed.

3. **`src/index.css`** — Remove the `.logo-blend` rule (no longer needed).

### Files changed
- New: `src/components/SpottedLogo.tsx`
- Edit: 18 files (all current logo usages)
- Edit: `src/index.css` (remove `.logo-blend`)

