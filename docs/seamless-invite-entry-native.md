# Native invitation-entry companion

This branch is based on the current native Command Center source (`153404a`), not the older mobile snapshot on the website branch. Preserve concurrent audit fixes when merging it into the next release.

## Changes

- Phone invitation entry, with a clear waiting state and verified-phone access requests in the existing Requested invites inbox.
- Two distinct eligible nominations remain mandatory and server-enforced. No skip or immediate nominee invitations.
- Per-account profile draft recovery; existing server nomination progress resumes in the correct missing slot.
- OTP requests, verification and resend resist repeated taps and recover from failures. Narrow-screen code slots fit without horizontal overflow.
- Apple sign-in still requires phone verification for a new gated account. A phone already belonging to another account requires signing into that existing account; this change does not silently merge accounts.
- Trusted `/join` links route to the normal session/admission gate. Links never grant membership.
- Associated domains added to app configuration. These entitlements require a new native build.

## Dependency and release order

The additive backend migration `20261023060223_seamless_invite_entry` is deployed. Website work is on `codex/seamless-invite-entry`, targeting `codex/nyc-onboarding-waves`.

Production admission remains open, First 100 draft, invitation sending disabled, and download URL unset. Coordinate native visual/device verification and one release build with the ongoing audit; no competing archive or TestFlight upload was started here. Only after that compatible build is ready should the installation link and invitation-only gate be enabled together.

Existing completed members must retain access. New incomplete accounts must verify the selected phone, have active access, finish a profile and nominate two people. The existing optional contact-discovery screen is separate.

## Validation

TypeScript and 41 focused tests passed:

```sh
cd mobile
node node_modules/typescript/bin/tsc --noEmit
node --test tests/seamless-entry.test.cjs tests/launch.test.cjs tests/launch-intro.test.cjs tests/admin-testing.test.cjs tests/telemetry.test.cjs
```

The admin-preview test's telemetry mock was updated to match the current native source; no admin-preview product behavior changed. Backend tests cover active/draft/paused waves, existing members, uninvited and Apple users, resume/retry, required distinct nominees, private access controls and outreach idempotency.

Pending release verification: native keyboard/VoiceOver and layout checks on two phones, actual SMS/Apple sign-in, installation and universal-link handoff. The existing audit simulator and build were left intact. Source implementation is complete; this branch has not been uploaded to or made available in TestFlight.

The recipient-facing address is `https://spottedsocial.vercel.app/join`. Its production-domain association file must be publicly fetchable. The Command Center branch preview remains protected; never send its preview address to recipients. The existing public site receives only a static landing page and association paths on `codex/public-invite-entry`.
