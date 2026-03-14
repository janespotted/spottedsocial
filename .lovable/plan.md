

# Fix APNS_AUTH_KEY — Wrong Value Stored

## Problem
The edge function logs show:
```
APNs key length after cleaning: 10 chars
```
A valid `.p8` private key is **~164 base64 characters**. The current `APNS_AUTH_KEY` secret contains only 10 characters — it appears the Key ID was accidentally stored in this field, or the value was truncated.

The error `DOMExceptionDataError: expected valid PKCS#8 data` confirms the key data is invalid/too short.

## Fix

1. Re-prompt you to update `APNS_AUTH_KEY` with the correct value
2. To get the correct value: open your `.p8` file in a text editor, delete the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, then remove all newlines so it's one continuous string (~164 characters)
3. Redeploy the `send-push` edge function

No code changes needed — just a secret value correction and redeployment.

