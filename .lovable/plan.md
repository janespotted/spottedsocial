

# Re-enter APNs Auth Key Secret

The current `APNS_AUTH_KEY` is 200 characters after cleaning, but a valid P8 key should be exactly **164 characters** of base64 content. This is the root cause of all push notification failures.

## What you need to do

1. Open your `.p8` file (downloaded from Apple Developer → Keys) in a text editor
2. Copy **only** the base64 content between the header/footer lines — do NOT include `-----BEGIN PRIVATE KEY-----` or `-----END PRIVATE KEY-----`
3. Remove all newlines so it's one continuous string (should be exactly 164 characters)
4. I'll prompt you to paste it as the new `APNS_AUTH_KEY` value

## After the key is fixed

1. Redeploy the `send-push` edge function so it picks up the corrected secret
2. Add token hygiene to `send-push` so stale tokens get cleared automatically on terminal APNs errors
3. Open the app to trigger a fresh token registration, then test a notification

