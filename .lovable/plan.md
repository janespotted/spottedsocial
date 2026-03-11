

## Disable Text Selection App-Wide

Add `user-select: none` and `-webkit-user-select: none` to the global `*` selector in `src/index.css` (within the existing `@layer base` block that already styles `*`).

### Change — `src/index.css`

In the `@layer base` block (around line 100), add to the existing `*` rule:

```css
* {
  @apply border-border;
  -webkit-user-select: none;
  user-select: none;
}
```

Single two-line addition. No other files need changes.

