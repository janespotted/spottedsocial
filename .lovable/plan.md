

## Fix: Redeploy the send-push edge function

### Root Cause
The `send-push` edge function currently deployed is an older build. The logs show `Sending APNs push to device: AD27456C...` without the `(host: ...)` suffix that exists on line 518 of the current source code. This means the deployed version predates the `APNS_SANDBOX` environment variable check on line 516 — it's always hitting the production APNs endpoint regardless of the secret we set.

### Fix
Force a redeployment of `supabase/functions/send-push/index.ts` by making a small change (e.g., adding a comment or updating a log line). Lovable auto-deploys edge functions when the file is modified.

### After deploying
The user needs to:
1. Re-build and install the app from Xcode onto their phone
2. Go to Settings in the app, toggle Push Notifications **off then on** to re-register the device token (ensures a fresh token is saved)
3. Trigger a notification (send a DM, etc.) and verify it arrives

