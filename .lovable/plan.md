

## Add Momentum Scrolling to All Scrollable Containers

Add `-webkit-overflow-scrolling: touch` to the existing global `*` rule in `@layer base` (around line 161-164) so all elements with `overflow: auto/scroll` get smooth iOS momentum scrolling.

### Change in `src/index.css`

Update the universal selector block at lines 161-164 to include the property:

```css
* {
  -ms-overflow-style: none;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
```

Single line addition — no other files need changes.

