

## Add Momentum Scrolling to All Scrollable Containers

### Problem
`-webkit-overflow-scrolling: touch` is set on `*` inside `@layer base`, which has low specificity. It also only works on elements that already have `overflow: auto` or `overflow: scroll`. Content stops abruptly on iOS because the momentum property isn't being applied with enough specificity.

### Fix
Add a global rule **outside** `@layer` (at the end of the file, near the existing scrollbar-hide block) that targets all elements with overflow behavior and forces momentum scrolling:

**`src/index.css`** — append after the existing global scrollbar-hide block (~line 370):

```css
/* iOS momentum scrolling for all scrollable containers */
*,
*::before,
*::after {
  -webkit-overflow-scrolling: touch !important;
}
```

This ensures every scrollable container gets momentum scrolling regardless of specificity conflicts. No layout or content changes.

