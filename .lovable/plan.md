

## Fix CheckInConfirmation Modal Dismissal

Three targeted changes in `src/components/CheckInConfirmation.tsx`:

1. **Line 6-8**: Remove `useNavigate` import and `spottedLogo` import; add `X` from `lucide-react`

2. **Lines 20, 24-27**: Remove `navigate` declaration. Change `handleDismissAndNavigate` to just call `closeCheckInConfirmation()` — no navigation.

3. **Line 101**: Add `onClick={e => e.stopPropagation()}` to the inner card div so taps on the card don't bubble to the backdrop.

4. **Lines 115-117**: Replace the Spotted logo with an X close button:
   ```tsx
   <button onClick={closeCheckInConfirmation} className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
     <X className="h-5 w-5 text-white" />
   </button>
   ```

Single file edit, no other changes needed.

