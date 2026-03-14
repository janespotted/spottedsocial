

## Plan: Fix build error and redeploy send-push

Two issues need fixing:

### 1. Build error in `daily-cleanup/index.ts` (line 207)
`error` is typed as `unknown` in TypeScript strict mode. Fix: cast `error` before accessing `.message`.

| File | Line | Change |
|------|------|--------|
| `supabase/functions/daily-cleanup/index.ts` | 207 | `error.message` → `(error as Error).message` |

### 2. Redeploy `send-push`
The hardcoded fallback key is already in the code (line 553) but the function needs redeployment. After fixing the build error, redeploy `send-push` so the fallback key is active at runtime.

### After deployment
Trigger a push notification from your iOS device. Logs should show:
- `APNs key source: fallback (env length: 16)`
- `APNs key length after cleaning: ~164 chars`
- `APNs JWT created successfully`

