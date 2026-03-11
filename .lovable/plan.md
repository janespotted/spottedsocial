

## Fix Feed Header Rubber-Band Bounce on iOS

The header at line 151 uses `sticky top-0` which moves with the page during iOS rubber-band overscroll. Need to switch to `fixed` positioning and add `overscroll-behavior-y: none` to the scroll container.

### Changes — `src/pages/Feed.tsx`

1. **Header (line 151)**: Change from `sticky top-0` to `fixed top-0 left-0 right-0` and add `pt-[env(safe-area-inset-top)]` so it sits under the notch correctly.

2. **Content below header**: Add a spacer div after the header to push content down by the header's height (since `fixed` removes it from flow). Approximate height ~120px, but we'll use a matching div.

3. **Outer container (line 143)**: Add `overscroll-behavior-y: none` via inline style to prevent iOS rubber-band pull on the whole page.

### Summary of line changes

- **Line 143**: Add `overscroll-behavior-y: none` style to the outer div
- **Line 151**: Replace `sticky top-0` with `fixed top-0 left-0 right-0` and add safe-area padding
- **After line 185**: Insert a spacer div to account for the fixed header height

