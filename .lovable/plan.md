

## Three Changes: Logo Compression, Code Splitting, DST-aware Cleanup

### 1. Compress `src/assets/spotted-s-logo.png`

Replace the 1.4MB PNG with an optimized version. Since I cannot run image compression tools directly, I'll convert it to a much smaller WebP file programmatically or replace it with a compressed PNG. The logo is imported across 18 files — all imports reference `@/assets/spotted-s-logo.png`, so I'll keep the same filename to avoid touching every import.

**Approach**: Replace the file with a highly compressed PNG (quantized, stripped metadata) targeting under 50KB. The logo is a simple "S" icon so aggressive compression is feasible without quality loss.

### 2. Code splitting with `React.lazy()` in `src/App.tsx`

Replace static imports with lazy imports for: Map, Admin, DemoSettings, Leaderboard, Messages, Thread, Friends, BusinessDashboard, BusinessPromote, BusinessYap, BusinessEvents, BusinessAuth, BusinessLanding.

Keep eager: Home, Auth, Feed, Profile (plus small pages like ResetPassword, InviteLanding, Terms, Privacy, NotFound, Settings, EditProfile, CloseFriends, Notifications).

Add a `Suspense` wrapper around `<Routes>` with the same spinner used in `ProtectedRoute`:

```typescript
const LazyFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);
```

### 3. DST-aware 5AM cutoff in `supabase/functions/daily-cleanup/index.ts`

Replace the hardcoded `setUTCHours(9, 0, 0, 0)` with dynamic timezone detection:

```typescript
// Get current ET date string to find today's 5AM ET
const etNow = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
const etDate = new Date(etNow);
// Set to 5:00 AM ET
etDate.setHours(5, 0, 0, 0);
// Convert back to UTC by computing the offset
const fiveAmEtStr = etDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
// Build a proper UTC date from the ET 5AM
const fiveAmET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
fiveAmET.setHours(5, 0, 0, 0);
// Get UTC offset: difference between UTC now and ET now
const utcNow = new Date();
const etNowDate = new Date(utcNow.toLocaleString('en-US', { timeZone: 'America/New_York' }));
const offsetMs = utcNow.getTime() - etNowDate.getTime();
const fiveAmUtc = new Date(fiveAmET.getTime() + offsetMs);
```

Simpler approach — parse ET time, set to 5AM, convert back:

```typescript
const now = new Date();
// Parse current time as ET
const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
const etNow = new Date(etStr);
// Set to 5:00 AM today in ET
etNow.setHours(5, 0, 0, 0);
// Compute UTC offset (UTC - ET)
const offsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime();
// Convert 5AM ET back to UTC
const fiveAmToday = new Date(etNow.getTime() + offsetMs);
// If we haven't hit 5AM ET yet, use yesterday's
if (now < fiveAmToday) {
  fiveAmToday.setTime(fiveAmToday.getTime() - 86400000);
}
```

This automatically handles EST (UTC-5) vs EDT (UTC-4).

### Files changed
- `src/assets/spotted-s-logo.png` — compressed to under 50KB
- `src/App.tsx` — lazy imports + Suspense fallback
- `supabase/functions/daily-cleanup/index.ts` — DST-aware 5AM ET cutoff

