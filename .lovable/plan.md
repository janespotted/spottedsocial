

## Update APNS_SANDBOX Secret

Set `APNS_SANDBOX` from `true` to `false`, switching push notifications to the production APNs endpoint. This is needed for TestFlight/App Store builds.

After updating, the `send-push` edge function should be redeployed to pick up the new value.

### Steps
1. Update secret `APNS_SANDBOX` → `false`
2. Redeploy `send-push` edge function

