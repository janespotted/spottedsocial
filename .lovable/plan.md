

## Fix Notch/Status Bar Scrolling

### Change — `src/index.css` (lines 322-331)

Replace the existing `@supports` block:

```css
/* iOS Safe Area Insets for notched devices */
@supports (padding: max(0px)) {
  #root {
    padding-top: env(safe-area-inset-top);
  }
  body {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

With:

```css
/* iOS Safe Area Insets for notched devices */
@supports (padding: max(0px)) {
  body {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}

#root::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top);
  background: #0a0118;
  z-index: 9999;
}
```

Removes the scrollable `padding-top` from `#root` and adds a fixed pseudo-element that permanently covers the notch area regardless of scroll position. Single file, single block replacement.

