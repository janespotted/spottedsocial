

## Hide Scrollbars Globally

Add global scrollbar hiding to `src/index.css` in the `@layer base` block, targeting both Webkit (Chrome/Safari) and Firefox.

### Change in `src/index.css`

Add to the existing `@layer base` block (after the `body` rule):

```css
* {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  display: none;
}
```

This applies the same logic already used by the `.scrollbar-hide` utility class, but globally to all elements.

