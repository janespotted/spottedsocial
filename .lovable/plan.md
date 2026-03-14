

## Update Secrets for Xcode Debug

Two secrets need updating:

1. **APNS_SANDBOX** → `true` (routes to `api.development.push.apple.com`)
2. **APNS_BUNDLE_ID** → `com.janereynolds.spotted` (matches Xcode debug signing)

Both secrets already exist, so this is a value update. I'll use the secret management tools to set them.

