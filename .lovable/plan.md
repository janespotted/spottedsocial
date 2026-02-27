

## Two Targeted Fixes

### 1. GPS failure: keep last known city (`src/lib/city-detection.ts`)

**Lines 162-167** — In the catch block of `detectUserCity`, instead of always defaulting to `'nyc'`:
- Read the existing cache via `getCachedCity()` (which may still hold a valid city even if expired — we want it here as a fallback)
- Actually, `getCachedCity()` respects TTL and returns null if expired. So we need to read localStorage directly to get the last city regardless of TTL.
- Read `localStorage.getItem('detected_city')`, parse it, extract `.city` if it exists. Fall back to `'nyc'` only if there's truly nothing.
- Do NOT call `cacheCity()` with the fallback — keep the stale cache so the next successful GPS read will update it naturally.

Replace lines 162-167:
```typescript
} catch (error) {
  // On GPS failure, keep using the last successfully detected city
  // rather than overwriting with NYC
  try {
    const raw = localStorage.getItem('detected_city');
    if (raw) {
      const parsed = JSON.parse(raw);
      const lastCity = parsed?.city || raw;
      if (lastCity === 'nyc' || lastCity === 'la' || lastCity === 'pb') {
        console.warn('City detection failed, keeping last known city:', lastCity);
        return lastCity;
      }
    }
  } catch {}
  console.warn('City detection failed, no previous city — defaulting to NYC');
  const defaultCity: SupportedCity = 'nyc';
  cacheCity(defaultCity);
  return defaultCity;
}
```

### 2. Clear reminder on check-in as "out" (`src/components/CheckInModal.tsx`)

The reminder key is `'checkin_reminder'` (confirmed from lines 89, 417, 426, 449).

**Line 526** — Right after `if (selectedStatus === 'out') {`, add:
```typescript
// Clear any pending reminder since user is now checking in
localStorage.removeItem('checkin_reminder');
```

Also in the private party custom venue path (line 565 area) and the regular venue path (line 586), the reminder is already covered since both are inside the `selectedStatus === 'out'` block — so one clear at line 527 handles both.

