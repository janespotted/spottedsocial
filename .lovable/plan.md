

## Fix: Logo Black Background Still Visible

### Problem
The `.logo-blend` class with `mix-blend-mode: screen` is defined inside `@layer utilities` (line 292-294 of `src/index.css`), but it's not effectively removing the black background. This is likely because:
1. The `@layer utilities` may give lower cascade priority in certain contexts
2. Backdrop-blur and other effects on parent elements can create isolation contexts that prevent blend modes from working against the visual background

### Solution
Move the `.logo-blend` rule **outside** all `@layer` blocks (making it a global rule with higher cascade priority) and ensure it works reliably:

**`src/index.css`** — Remove lines 290-294 from inside the `@layer utilities` block, and add at the end of the file (after all `@layer` blocks):

```css
/* Logo transparency — outside @layer for maximum specificity */
.logo-blend {
  mix-blend-mode: screen !important;
}
```

### Files changed
- `src/index.css` — move `.logo-blend` outside `@layer utilities`

