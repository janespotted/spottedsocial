

## Plan: Four Fixes

### 1. CheckInModal expiry import — Already correct
`CheckInModal.tsx` line 18 already imports `calculateExpiryTime` from `@/lib/time-utils`. No local duplicate exists. **No change needed.**

### 2. Gate DemoActivator to internal users only

**`src/App.tsx`** — Wrap `<DemoActivator />` so it only renders when:
- The logged-in user's email ends with `@spotted.com`, OR
- `localStorage.getItem('pending_demo_activation')` is truthy

This requires a small wrapper component (since we need `useAuth` which is already available in `AppContent` context) or inline logic. The simplest approach: create a `GatedDemoActivator` that checks both conditions before rendering `<DemoActivator />`.

**`src/components/DemoActivator.tsx`** — Also harden the URL-param detection (Step 1 `useEffect`) to skip setting `pending_demo_activation` if the user isn't `@spotted.com`. However, since Step 1 runs before auth, the localStorage gate in App.tsx plus the auth check in Step 2 together prevent activation for regular users.

### 3. DST-safe 5 AM ET cutoff in daily-cleanup

**`supabase/functions/daily-cleanup/index.ts`** — Replace the hardcoded `setUTCHours(9, 0, 0, 0)` with proper timezone conversion:

```typescript
// Build "today 5:00 AM ET" properly handling DST
const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
nowET.setHours(5, 0, 0, 0);
// If current ET time is before 5 AM, use yesterday's 5 AM
const currentET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
if (currentET < nowET) {
  // We're between midnight and 5am ET — but cron runs at 5:10am so this shouldn't happen
  // Safety: use yesterday's 5am
  nowET.setDate(nowET.getDate() - 1);
}
// Convert back to UTC
const fiveAmToday = new Date(nowET.toLocaleString('en-US', { timeZone: 'America/New_York' }));
// Actually simpler: construct the ET date, then get its UTC equivalent
const etDateStr = nowET.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
const cutoffDate = new Date(`${etDateStr}T05:00:00-05:00`); // or determine offset dynamically
```

Better approach using Intl to get the actual UTC offset:
```typescript
const now = new Date();
// Get current ET offset dynamically (handles DST)
const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});
const parts = etFormatter.formatToParts(now);
const etYear = parts.find(p => p.type === 'year')!.value;
const etMonth = parts.find(p => p.type === 'month')!.value;
const etDay = parts.find(p => p.type === 'day')!.value;
const etHour = parseInt(parts.find(p => p.type === 'hour')!.value);

// Build 5 AM ET today
let fiveAmET = new Date(`${etYear}-${etMonth}-${etDay}T05:00:00`);
// Adjust: find the UTC offset by comparing
const etNow = new Date(`${etYear}-${etMonth}-${etDay}T${String(etHour).padStart(2,'0')}:00:00`);
const offsetMs = now.getTime() - etNow.getTime();
// Apply same offset to 5am
const fiveAmUTC = new Date(fiveAmET.getTime() + offsetMs);

if (now < fiveAmUTC) {
  fiveAmUTC.setTime(fiveAmUTC.getTime() - 86400000);
}
const cutoff = fiveAmUTC.toISOString();
```

This ensures EDT (UTC-4) and EST (UTC-5) are handled correctly.

### 4. Bundle ID update

**`capacitor.config.ts`** — Change `appId` from `'app.lovable.922058387a8543c998041815d203234f'` to `'com.spotted.app'`.

### Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Gate `<DemoActivator />` behind email + localStorage check |
| `supabase/functions/daily-cleanup/index.ts` | Replace hardcoded UTC hour with DST-aware timezone math |
| `capacitor.config.ts` | Change appId to `com.spotted.app` |

