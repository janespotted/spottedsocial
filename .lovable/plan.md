

# Redeploy send-push Edge Function

The secrets have been updated but the running edge function still has the old values cached. A redeployment is needed.

## Steps

1. Redeploy the `send-push` edge function to pick up the updated `APNS_KEY_ID` and `APNS_AUTH_KEY` secrets
2. After deployment, open the app on your physical device to trigger a fresh token registration, then test a push notification

No code changes needed — just a redeployment.

