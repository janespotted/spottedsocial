

## Fix: Safe Area Inset at Top

### Problem
`padding-top: env(safe-area-inset-top)` is currently on `body` inside an `@supports` block, but this doesn't reliably push content down when child elements use `min-h-[100dvh]` or full-screen gradient backgrounds — content renders behind the notch/Dynamic Island.

### Fix
Move `padding-top: env(safe-area-inset-top)` from `body` to `#root` in `src/index.css`. The `#root` div is the app shell wrapper for all routes (Layout-wrapped and standalone pages like Auth/NotFound), so this single change covers everything.

### Change

**`src/index.css`** (~line 320-326)

Replace the `@supports` block's `body` padding-top with `#root` padding-top:

```css
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

One file, one block changed. `viewport-fit=cover` in `index.html` stays untouched.

