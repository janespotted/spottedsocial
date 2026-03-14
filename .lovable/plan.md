

# Why ALL Push Notifications Broke After TestFlight Switch

## Root Cause: Two Separate Issues

The logs prove the edge function **IS** being called (there are recent log entries). The problem is **APNs is rejecting every request** with `403 BadEnvironmentKeyInToken`. There are two contributing issues:

### Issue 1: Leading Space in APNS_BUNDLE_ID (Critical)
The logs show the bundle ID is `" com.janereynolds.spotted"` (note the leading space). This alone would cause APNs to reject the request since the `apns-topic` header won't match any valid app.

**Fix:** Update the `APNS_BUNDLE_ID` secret to `com.janereynolds.spotted` (no leading space). Then redeploy the `send-push` edge function.

### Issue 2: APNs Environment Mismatch (Critical)
The error `BadEnvironmentKeyInToken` specifically means the APNs token environment doesn't match what Apple expects. The iOS entitlements file (`ios/App/App/App.entitlements`) currently has:

```xml
<key>aps-environment</key>
<string>development</string>
```

But `APNS_SANDBOX` was changed to `false`, meaning the edge function sends to `api.push.apple.com` (production). When a device registers with a **development** entitlement, Apple issues a **sandbox** device token. Sending that sandbox token to the **production** APNs endpoint returns `403 BadEnvironmentKeyInToken`.

For TestFlight, this is the key fact: **TestFlight builds use the production APNs environment automatically**, regardless of what's in the entitlements plist. So the entitlements file should say `production`, and `APNS_SANDBOX` should be `false`. However, the device token the app received may have been registered during a **development** build via Xcode and cached in the profile database.

### Issue 3: Thread.tsx `p_sender_id` Bug (Secondary — DMs only)
The recent code change added an invalid `p_sender_id` parameter to the `create_notification` RPC call in `Thread.tsx`, causing the RPC to fail silently for DMs specifically. Other notification types (rally, meetup, venue invite) are unaffected by this.

## Fix Plan

### Step 1: Fix APNS_BUNDLE_ID secret
Remove the leading space. Set value to exactly `com.janereynolds.spotted`.

### Step 2: Update entitlements for production
Change `ios/App/App/App.entitlements` from `development` to `production`:
```xml
<key>aps-environment</key>
<string>production</string>
```

### Step 3: Fix Thread.tsx RPC call
Remove the invalid `p_sender_id` parameter from the `create_notification` RPC call (line 391).

### Step 4: Re-register device token
After installing the new TestFlight build, the device needs to re-register with APNs to get a **production** device token. The old development token stored in the database is invalid for production APNs. The app should automatically do this on launch via Capacitor's `PushNotifications.register()`, which will update the `apns_device_token` in the profiles table.

### Step 5: Redeploy send-push
After updating the secret, redeploy the `send-push` edge function so it picks up the corrected `APNS_BUNDLE_ID`.

## Summary

| Issue | Scope | Fix |
|-------|-------|-----|
| Leading space in APNS_BUNDLE_ID | All notifications | Update secret |
| Entitlements say "development" but APNS_SANDBOX=false | All native push | Change entitlements to "production" |
| Stale development device token in DB | All native push | Re-register on TestFlight build |
| `p_sender_id` in Thread.tsx RPC | DMs only | Remove parameter |

