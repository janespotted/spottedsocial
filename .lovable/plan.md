

## Fix: Remove duplicate "I'm at a Private Party" button

The screenshot shows two identical "I'm at a Private Party" buttons — one inside the `!detectedVenue` block (lines 971-991) and one always-visible below the confirm button (lines 1024-1036). When no venue is detected, both render.

### Change (`src/components/CheckInModal.tsx`)

Remove the first "I'm at a Private Party" button and its "or" divider from the `!detectedVenue` block (lines 977-990). Keep only the "No nearby venues found" text inside that block. The always-visible button at lines 1024-1036 already handles all cases.

**Result**: One single "I'm at a Private Party" button always appears below the confirm/enter button, regardless of whether a venue was detected.

