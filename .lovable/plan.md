

## Fix CheckInConfirmation: X button + keyboard

### Problem Analysis

1. **X button not working on iOS**: The backdrop's `onTouchEnd={handleBackdropClick}` is likely interfering with the button's `onClick` on touch devices. Touch events fire before click events, and the touchEnd handler on the ancestor can prevent the click from reaching the button.

2. **Keyboard appearing**: No input exists in this component, but the previously focused input (from CheckInModal or elsewhere) may retain focus. Need to blur active element on mount.

### Changes — `src/components/CheckInConfirmation.tsx`

1. **Remove `onTouchEnd` from backdrop** — it's redundant with `onClick` and causes touch event conflicts on iOS that prevent the X button from working.

2. **Add `onTouchEnd={e => e.stopPropagation()}` to inner card** alongside the existing `onClick` stopPropagation, so touch events from the card (including the X button) don't bubble.

3. **Change X button to use `onTouchEnd` + `onClick`** for reliable iOS dismissal:
   ```tsx
   <button 
     onClick={closeCheckInConfirmation}
     onTouchEnd={(e) => { e.stopPropagation(); closeCheckInConfirmation(); }}
     ...
   >
   ```

4. **Add useEffect to blur active element on mount** — prevents keyboard from appearing:
   ```tsx
   useEffect(() => {
     if (showCheckInConfirmation) {
       (document.activeElement as HTMLElement)?.blur?.();
     }
   }, [showCheckInConfirmation]);
   ```

Single file edit.

