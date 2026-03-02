

## Fix: Replace buggy local `calculateExpiryTime` with correct import

### Problem
The local `calculateExpiryTime` at lines 181-187 always adds 1 day, so check-ins between midnight and 5am expire ~27 hours later. The correct version in `src/lib/time-utils.ts` checks `if (now.getHours() < 5)` and sets 5am today.

### Changes in `src/components/CheckInModal.tsx`

1. **Add import** at line 17 area:
   ```typescript
   import { calculateExpiryTime } from '@/lib/time-utils';
   ```

2. **Delete lines 181-187** — the local `calculateExpiryTime` function. All call sites resolve to the imported version.

### Files changed
- `src/components/CheckInModal.tsx`

