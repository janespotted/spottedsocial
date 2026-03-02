

## Fix: Replace buggy local `calculateExpiryTime` with shared utility

### Problem
The local `calculateExpiryTime` in `CheckInModal.tsx` (lines 181-187) always adds 1 day before setting 5am, so check-ins between midnight and 5am expire ~27 hours later instead of at 5am the same morning. The correct version already exists in `@/lib/time-utils`.

### Changes in `src/components/CheckInModal.tsx`

1. **Add import** (after line 19 or nearby):
   ```typescript
   import { calculateExpiryTime } from '@/lib/time-utils';
   ```

2. **Delete lines 181-187** — the local `calculateExpiryTime` function.

No other files change. All existing call sites within CheckInModal already reference `calculateExpiryTime()` by name, so they'll pick up the imported version automatically.

