

## Remove debug logging

### `src/contexts/AuthContext.tsx`
- Remove line 54: `console.log('[AuthDebug] useEffect mount...')`
- Remove lines 58-61: Four `[AuthDebug]` console.log lines
- Remove lines 63-68: Apple debug sessionStorage block
- Remove line 74: `[AuthDebug] loading set to false` log
- Remove lines 84, 86: `[AuthDebug] SIGNED_IN` navigation logs

### `src/pages/Auth.tsx`
- Remove the entire `handleAppleSignIn` function (lines ~121-156) plus `appleLoading`/`appleError` state variables and `sessionStorage` usage — all dead code since the Apple button was already removed.

