

## Fix: Stale "Yap about it" and "Maybe later" Buttons

### Root Cause
The `phase` state in `CheckInConfirmation.tsx` never resets back to `'celebration'`. After the first check-in cycle, `phase` stays at `'yap_prompt'`. On subsequent check-ins, the yap prompt renders immediately in a stale state — the component skips the celebration animation entirely and the buttons can appear before the context values are fully committed, making them unresponsive.

### Fix — `src/components/CheckInConfirmation.tsx`

1. **Reset `phase` when confirmation opens**: Add a `useEffect` that resets `phase` to `'celebration'` whenever `showCheckInConfirmation` transitions to `true`. This ensures every check-in starts fresh with the celebration animation, then transitions to yap prompt after 2.5s.

2. **Capture venue data in handler closures**: In `handleShareClick`, capture `checkInVenueName` and `checkInIsPrivateParty` into local variables before calling `navigate` and `closeCheckInConfirmation`, preventing any race between the navigation state and the context cleanup.

3. **Same for "Maybe later"**: Ensure `handleDismissAndNavigate` calls `closeCheckInConfirmation()` cleanly and resets phase.

### Files changed
- `src/components/CheckInConfirmation.tsx`

