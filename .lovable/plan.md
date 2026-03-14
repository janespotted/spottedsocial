

## Fix: Update APNS_AUTH_KEY with correct full-length key

The uploaded `.p8` file confirms the key body is **164 characters**. The previously stored secret was only 96 characters (truncated during paste).

### Steps

1. **Update the `APNS_AUTH_KEY` secret** with the exact 164-character base64 string extracted from the uploaded file (no PEM headers, no newlines)
2. **Redeploy the `send-push` edge function** so it picks up the new secret value
3. **Test** by triggering a push notification from the iOS device

| Step | Action |
|------|--------|
| Update secret | Set `APNS_AUTH_KEY` to the full 164-char key from the .p8 file |
| Redeploy | Deploy `send-push` edge function |
| Verify | Trigger notification and check logs for successful APNs delivery |

