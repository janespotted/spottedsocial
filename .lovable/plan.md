

## Google Sign-In Failure — Diagnosis

The screenshot shows a generic "Google sign-in failed, please try again" error. The current error handler (Auth.tsx line 115-118) swallows the actual error details and shows only a generic message.

**Likely cause**: The preview environment uses a different origin (`id-preview--*.lovable.app`) which may cause the OAuth redirect to fail or the session token exchange to error. Auth logs confirm a `session_not_found` (403) from the preview IP at the same timestamp.

**On your published domain** (`spottedsocial.lovable.app`), Google sign-in is working — the auth logs show a successful Google login from that domain moments later.

### Fix

1. **Better error logging** in `handleGoogleSignIn` — log the actual error to console so we can see the real failure reason
2. **Show the actual error message** instead of generic text, so debugging is easier
3. **Add a fallback message** noting to try from the published app if in preview

### File: `src/pages/Auth.tsx`

Update `handleGoogleSignIn` catch block (lines 115-118):
- `console.error('Google sign-in error:', error)` 
- Show `error?.message` if available, fall back to generic message
- Same treatment for `handleAppleSignIn`

This is a small change — just improving error visibility so we can diagnose the root cause if it recurs on the published domain.

