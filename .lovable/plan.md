

## Add Delay to Blur in CheckInConfirmation

### Change — `src/components/CheckInConfirmation.tsx`

In the `useEffect` that blurs the active element (~line 50), wrap the blur call in a `setTimeout` with 100ms delay so it reliably dismisses the keyboard on iOS.

```tsx
// Before
(document.activeElement as HTMLElement)?.blur?.();

// After
setTimeout(() => {
  (document.activeElement as HTMLElement)?.blur?.();
}, 100);
```

Single line change in one file.

