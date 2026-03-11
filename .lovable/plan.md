

## Diagnosis

The button wiring and handler code are both correct. The most likely explanation for **zero console output on click** is that `lovable.auth.signInWithOAuth("apple", ...)` performs a **full-page redirect** to Apple's OAuth page *before* the subsequent `console.log` lines execute. The first two logs (`Starting...` and `redirect_uri:`) should fire, but if the redirect is near-instant, the browser may flush the page before the console renders them.

The `cloud-auth-js` library's `signInWithOAuth` likely calls `window.location.assign(...)` internally, which unloads the page immediately — wiping any pending console output.

## Plan

### 1. Add a synchronous `alert()` gate before the OAuth call
Temporarily replace the first console.log with `window.alert('[AppleAuth] About to call signInWithOAuth')`. An alert blocks execution and proves the handler fires. This definitively separates "handler not called" from "page redirects too fast to see logs."

**File:** `src/pages/Auth.tsx` — `handleAppleSignIn` function (line ~128)

```typescript
// Add before the OAuth call:
window.alert('[AppleAuth] Handler fired. redirect_uri: ' + getRedirectOrigin());
```

### 2. If alert fires → the handler works, redirect is just fast
Remove the alert and instead persist debug state to `sessionStorage` before the redirect, then read it back on return:

**Before OAuth call:**
```typescript
sessionStorage.setItem('apple_auth_debug', JSON.stringify({
  started: Date.now(),
  redirectUri: getRedirectOrigin(),
}));
```

**In AuthContext.tsx `onAuthStateChange`:**
```typescript
const debugInfo = sessionStorage.getItem('apple_auth_debug');
if (debugInfo) {
  console.log('[AppleAuth] Pre-redirect state:', debugInfo);
  console.log('[AppleAuth] Return event:', event, 'session:', !!session);
  sessionStorage.removeItem('apple_auth_debug');
}
```

This captures the full round-trip: what was sent before redirect, and what came back after.

### 3. If alert does NOT fire → module-level crash
Add a top-level try/catch around the `lovable` import in Auth.tsx to catch any silent module initialization errors:

```typescript
let lovableAuth: typeof import('@/integrations/lovable');
try {
  lovableAuth = await import('@/integrations/lovable');
  console.log('[AppleAuth] lovable module loaded OK');
} catch (e) {
  console.error('[AppleAuth] lovable module failed to load:', e);
}
```

### Summary of changes

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Add `window.alert()` gate + `sessionStorage` debug breadcrumb before OAuth redirect |
| `src/contexts/AuthContext.tsx` | Read `sessionStorage` breadcrumb on auth state change to log the return trip |

Two tiny, temporary debug additions. No logic changes.

