

## Revert Notch Fix in `src/index.css`

### Change (lines 322-339)

Replace the current `@supports` block and `#root::before` pseudo-element with:

```css
/* iOS Safe Area Insets for notched devices */
@supports (padding: max(0px)) {
  #root {
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}

#root {
  background-color: #0a0118;
}
```

This restores the original `padding-top` approach (which correctly pushes content below the notch) and adds a background color to `#root` so the area behind the status bar isn't transparent during scrolling. The `#root::before` pseudo-element is removed entirely.

