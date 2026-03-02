

## Fix: Bootstrap mode should use detected city, not hardcode NYC

### Root Cause
`getBootstrapMode()` is synchronous and falls back to `'nyc'` before async GPS detection completes. An LA user sees NYC leaderboard data on first load until GPS resolves.

### Solution
Two changes needed:

**1. `src/lib/bootstrap-config.ts`** — When `getBootstrapMode()` has no cached city, don't commit to NYC. Instead, return a neutral fallback and let the city update reactively once GPS resolves.

Actually, the simpler fix: make `getBootstrapMode()` respect the city from `useUserCity` by having the consuming components pass the detected city rather than reading it independently. But that's a larger refactor.

**Simplest fix:** In `getBootstrapMode()`, change the fallback from hardcoded `'nyc'` to also check the `detected_city` localStorage key (which `useUserCity` writes to on first GPS detection). This way both caches stay in sync:

```typescript
// Line 46 of bootstrap-config.ts — currently:
const city = getCachedCity() || 'nyc';

// Change to: also check the detected_city key directly
const city = getCachedCity() || 'nyc'; // getCachedCity already reads detected_city
```

Wait — `getCachedCity()` reads from `detected_city` in localStorage, which is the same key that `detectUserCity()` writes to. So the real issue is just timing: on a **true first visit**, there's no cached city yet because GPS hasn't fired.

**2. `src/hooks/useBootstrapMode.ts`** — Listen for the `cityChanged` event (dispatched by `cacheCity()` after GPS resolves) and update the bootstrap city reactively. Currently it only listens for `bootstrapModeChanged` and `storage`, not `cityChanged`.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useBootstrapMode.ts` | Add listener for `cityChanged` event so bootstrap city updates when GPS detects LA/PB |
| `src/lib/bootstrap-config.ts` | No change needed — `getCachedCity()` already reads the right key; the issue is purely timing |

This way, an LA user on first load:
1. Briefly sees NYC data (unavoidable — GPS takes ~1-2s)
2. GPS resolves → `cacheCity('la')` fires `cityChanged` event
3. `useBootstrapMode` catches the event → updates city to `'la'`
4. Leaderboard re-renders with LA venue data

The brief NYC flash is acceptable since GPS must complete first. If we want zero flash, we'd need to show a loading state until city is detected, but that adds friction.

