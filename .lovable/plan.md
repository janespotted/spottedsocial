

## Fix: Always show "I'm at a Private Party" button in venue confirmation

**Problem**: The "I'm at a Private Party" button in the venue confirmation screen is only shown when no venue is detected (`!detectedVenue`, line 971). When GPS finds a nearby venue, the button is hidden. The user's GPS detected a venue named "Private party" and was shown the standard venue confirm flow without the option to enter the private party neighborhood flow.

**Fix** (`src/components/CheckInModal.tsx`):

Move the "I'm at a Private Party" button out of the `!detectedVenue` conditional block so it always appears in VenueConfirmContent, regardless of whether a venue was detected. Place it below the confirm button (after line 1022) with a divider, so the flow is:

1. Venue confirmation (detected or manual)
2. Confirm button
3. Divider ("or")
4. "I'm at a Private Party" button

This ensures users can always switch to the private party flow from the venue confirmation screen.

