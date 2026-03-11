

## Remove Google Sign-In for Beta

Hide the Google sign-in button and related error state from the Auth page. Keep the code intact (just comment out or skip rendering) so it's easy to re-enable later.

### Changes

**`src/pages/Auth.tsx`**

1. Remove the Google sign-in button block (lines ~284–308) — the `<Button>` with "Continue with Google" and the `googleError` paragraph below it.
2. Keep the `handleGoogleSignIn` function and state variables in place (dead code is fine for beta, easy to restore).

The Apple sign-in button and email form remain unchanged.

