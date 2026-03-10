

## Fix Safe Area Inset at Top

The Layout component already applies `pt-[env(safe-area-inset-top,0px)]` for non-map pages, but the root `<div>` in `App.tsx` or `index.html` doesn't account for it globally — meaning pages outside `Layout` (Auth, business pages, onboarding) miss the top inset.

### Change in `src/index.css`

In the existing `@supports (padding: max(0px))` block (around line 198), add `padding-top` to the body rule:

```css
@supports (padding: max(0px)) {
  body {
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

### Change in `src/components/Layout.tsx`

Remove the redundant `pt-[env(safe-area-inset-top,0px)]` from the Layout wrapper (line ~119) since the body now handles it globally — this prevents double-padding on Layout-wrapped pages.

