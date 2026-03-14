

# Update APNS_KEY_ID and APNS_AUTH_KEY Secrets

Both secrets already exist and need to be re-entered with corrected values.

## What you need to prepare

1. **APNS_KEY_ID**: Go to [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list), find your APNs key, and copy the **Key ID** (a 10-character alphanumeric string like `ABC1234DEF`).

2. **APNS_AUTH_KEY**: Open your `.p8` file in a text editor, then:
   - Delete the `-----BEGIN PRIVATE KEY-----` line
   - Delete the `-----END PRIVATE KEY-----` line
   - Remove all newlines so it's **one continuous string**
   - The result should be exactly **164 characters** of base64

## Implementation

Once you switch to implementation mode, I will use the secret update tool to prompt you for each value in order:
1. First prompt: `APNS_KEY_ID`
2. Second prompt: `APNS_AUTH_KEY`
3. Redeploy the `send-push` edge function so it picks up the new values

