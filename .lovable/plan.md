

## Fix: APNs Push Notifications for Xcode Debug Builds

### Root Causes

1. **Wrong APNs endpoint**: The `send-push` edge function defaults to the production APNs server (`api.push.apple.com`), but your Xcode debug build registers a sandbox device token. Apple returns `403 BadEnvironmentKeyInToken`.

2. **Bundle ID mismatch (likely)**: Xcode signs the app with bundle ID `com.janereynolds.spotted-`, but the `APNS_BUNDLE_ID` secret is probably set to `com.spotted.app`. The `apns-topic` header must match the bundle ID of the installed app.

### Changes

#### 1. Add `APNS_SANDBOX` secret
Set a new secret `APNS_SANDBOX` with value `true`. This tells the edge function to use `api.development.push.apple.com` instead of the production endpoint.

#### 2. Update `APNS_BUNDLE_ID` secret
Update the `APNS_BUNDLE_ID` secret value to `com.janereynolds.spotted-` to match your Xcode signing configuration.

#### 3. No code changes needed
The `send-push` edge function already has the sandbox routing logic on line 516. It just needs the secret to be set.

### After fixing
Once you set those two secrets, the push flow becomes:
- App registers with APNs sandbox → gets sandbox device token → saves to `apns_device_token` in profiles
- Edge function reads `APNS_SANDBOX=true` → sends to `api.development.push.apple.com` with matching bundle ID
- Apple accepts the push

### Important note for production
When you ship to TestFlight/App Store, you'll need to either:
- Remove the `APNS_SANDBOX` secret (or set it to `false`)
- Update `APNS_BUNDLE_ID` back to your production bundle ID

