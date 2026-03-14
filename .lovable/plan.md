
Diagnosis from current code + logs:
- The notification trigger path is working: notifications are being inserted and `send-push` is being invoked (HTTP 200), so this is not blocked by RLS or a client-side “environment check.”
- Failure is at APNs delivery: `APNs push failed: 403 {"reason":"BadEnvironmentKeyInToken"}`.
- There is a concrete config mismatch still in codebase: `ios/App/App.xcodeproj/project.pbxproj` still has `PRODUCT_BUNDLE_IDENTIFIER = "com.janereynolds.spotted-"` for both Debug and Release, while backend APNs topic is `com.janereynolds.spotted`.
- Receiver token in DB remains `82401636...` (same prefix seen in failing logs), suggesting token/environment is not being corrected for production delivery.

Implementation plan:
1) Align native bundle ID in iOS project
- Update both Debug + Release `PRODUCT_BUNDLE_IDENTIFIER` to `com.janereynolds.spotted` in `ios/App/App.xcodeproj/project.pbxproj`.
- Keep `ios/App/App/App.entitlements` as `aps-environment = production`.

2) Harden token refresh in app startup
- In native startup registration flow (`src/App.tsx`), keep auto-registration but add stronger logging and explicit save confirmation so we can verify token refresh happened after TestFlight install.
- Ensure registration runs for authenticated users every app open and updates `profiles.apns_device_token` reliably.

3) Add APNs environment fallback in `send-push`
- If APNs returns `BadEnvironmentKeyInToken`, retry once on the opposite APNs host (prod <-> sandbox) before failing.
- Log both attempts (host, topic, token prefix, reason) so we can immediately see which environment the token belongs to.
- This prevents full outage during transition periods where some users still have stale sandbox tokens.

4) Add token format guardrails
- Validate APNs token format before sending (hex-only expectation) and log invalid token shape early.
- Prevent ambiguous APNs errors for non-iOS or malformed tokens.

5) Verify end-to-end after changes
- Confirm in logs:
  - `push:token_received` / profile token update on app launch
  - `send-push` attempts APNs with correct topic
  - at least one successful APNs send (not just function invocation)
- Test DM + meetup + friend request end-to-end on TestFlight devices.

Technical details:
- There is no app code path currently blocking pushes by bundle ID/environment before trigger; the break is delivery-layer mismatch.
- Main code-level mismatch to fix first is iOS target bundle ID still set to old value (`...spotted-`) in `project.pbxproj`.
- Secondary resilience fix is server-side APNs fallback on `BadEnvironmentKeyInToken` so pushes keep working while tokens are being reissued.
