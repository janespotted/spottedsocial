

## Fix: CheckInConfirmation dismiss on backdrop tap (iOS)

The `handleBackdropClick` logic exists but fails on iOS because:
1. iOS Safari doesn't reliably fire `onClick` on non-interactive `div` elements — needs `cursor-pointer` or an explicit touch handler
2. The `e.target === e.currentTarget` check is correct but never reached on iOS

### Changes — `src/components/CheckInConfirmation.tsx`

**Line 96**: Add `cursor-pointer` to the backdrop div's className (this is the standard iOS fix — it tells the browser the element is interactive and should receive click/touch events).

**Lines 73-77**: Additionally add an `onTouchEnd` handler as a belt-and-suspenders approach for iOS WebViews/Capacitor:

```tsx
const handleBackdropClick = (e: React.MouseEvent | React.TouchEvent) => {
  if (e.target === e.currentTarget) {
    handleDismissAndNavigate();
  }
};
```

Add `onTouchEnd={handleBackdropClick}` alongside `onClick` on the backdrop div, and add `cursor-pointer` to its className.

Two small changes, same file only.

