

# Add APNs Device Token Support

## Overview
Add native iOS push notification support by storing APNs device tokens in the database and updating the push notification edge function to route notifications through either APNs (for native iOS) or Web Push/VAPID (for browsers).

## Part 1: Database Migration

Add a nullable `apns_device_token` column to the `profiles` table:

```sql
ALTER TABLE public.profiles ADD COLUMN apns_device_token text;
```

No RLS changes needed -- existing profile policies already cover read/update for own profile.

## Part 2: Update send-push Edge Function

Modify `supabase/functions/send-push/index.ts`:

1. **Update the profile query** to also select `apns_device_token`:
   ```
   .select('push_subscription, push_enabled, display_name, apns_device_token')
   ```

2. **Update the push-enabled check** so that having *either* a web subscription or an APNs token (with push_enabled=true) is sufficient to proceed.

3. **Add an `sendApnsPush()` function** that:
   - Creates a JWT signed with the APNs auth key (ES256, using `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` secrets)
   - Sends an HTTP/2 POST to `https://api.push.apple.com/3/device/{token}` with the notification payload
   - Sets proper APNs headers: `apns-topic` (bundle ID), `apns-push-type: alert`, `apns-priority: 10`
   - Returns success/failure boolean

4. **Route notifications** in the main handler:
   - If `apns_device_token` exists on the receiver's profile, call `sendApnsPush()`
   - If `push_subscription` exists, call existing `sendWebPush()`
   - If both exist, send to both channels
   - Log which channel(s) were used

5. **APNs payload format**:
   ```json
   {
     "aps": {
       "alert": { "title": "...", "body": "..." },
       "sound": "default",
       "badge": 1,
       "thread-id": "notification-type"
     },
     "url": "/messages",
     "type": "dm"
   }
   ```

## Secrets Required (Not Yet Set)

The APNs integration will need three new secrets before it can actually send. The function will gracefully skip APNs if these are missing:
- `APNS_KEY_ID` -- Key ID from Apple Developer
- `APNS_TEAM_ID` -- Apple Developer Team ID  
- `APNS_AUTH_KEY` -- The .p8 private key contents (base64 encoded)
- `APNS_BUNDLE_ID` -- The app's bundle identifier

These won't be requested now since you said you'll provide them later. The code will check for their presence and fall back to web push only if missing.

## Technical Notes

- Deno's `fetch()` handles HTTP/2 transparently when connecting to `api.push.apple.com`, so no special HTTP/2 library is needed.
- APNs JWT tokens are valid for up to 1 hour; the function generates a fresh one per invocation (edge functions are short-lived, so caching isn't needed).
- No changes to the frontend client-side code in this step -- the native Capacitor push registration that populates `apns_device_token` will be a separate task.

