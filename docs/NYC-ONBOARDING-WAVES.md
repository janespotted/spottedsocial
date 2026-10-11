# NYC onboarding and invitation waves

New users sign in, save a combined name/username profile, and nominate exactly two distinct eligible phone numbers. There is no skip or choose-later path. Selections persist server-side; neither account age nor editable auth metadata finishes onboarding. Existing accounts at migration time retain access.

The sign-in screen introduces Spotted in three short lines: see who’s out, find your people, choose what you share. Profile and nomination copy stays brief. One-sentence, dismissible tips explain status confirmation, map visibility and a populated Morning After recap where those features appear. Dismissal is saved per account and feature on the device; these preferences never affect required onboarding, access or location consent. Empty recaps explain themselves without an extra tip or tour.

## Admission and permissions

The migration introduces private membership, nomination, operator and wave tables. Public RPCs call private implementations with explicit identity checks and hardened search paths. Restrictive table/Storage policies block incomplete members; a PostgREST pre-request hook also blocks legacy SECURITY DEFINER RPCs, including old friend-invite URLs. The hook refuses installation over another configured hook until they are deliberately composed. The video-upload function checks completion before creating a Mux upload. Other private media/contact functions already carry the caller JWT through their database RPC.

Phone numbers are normalized to E.164. A global unique constraint arbitrates concurrent nominations; per-member locks serialize the two slots. Failed eligibility checks consume a bounded hourly check allowance. Completion rechecks registered numbers and requires both saved slots. Only completed nominations can enter a wave. Nominations never create friendships, location consent, or outgoing messages.

Wave activation is admin-only, serialized, bounded to the requested number (1–500), and idempotent by a request UUID persisted before activation, including across app restarts. Activation and notification delivery are separate: this implementation grants phone-bound admission, but does not send SMS. A verified phone can claim its activated nomination exactly once; forwarding a profile/QR link does not grant admission. Apple login remains available. Linking the invited phone is optional for Apple accounts; an operator can admit an Apple-only account after verifying its invitation separately. Phone-only deduplication cannot identify an existing Apple-only account with no linked phone.

## Internal city testing

New public profiles default to NYC. Ordinary users cannot change city, even via a direct profile update. `spotted_private.launch_operators.city_tester` enables private Settings controls; an environment flag or stored Demo Mode preference grants no permission. Existing trusted night testers and server-owned admin roles initialize these capabilities. City changes reuse the existing city-scoped venues, map, rankings, plans, `cityToTimezone`, and 5 AM reset rules. LA uses America/Los_Angeles.

## Coordinated release

Deploy the migration and updated `mux-create-upload` function with the new app version. The migration preserves existing members, but new users on old builds must update to finish onboarding. Do not deploy the migration by itself to production before an updated app is available.

Wave gating defaults **off** so this migration does not silently switch production to closed admission. Mandatory profile/two-person completion still applies to newly created accounts. At the approved launch, enable `spotted_private.launch_settings.wave_gate` in a coordinated change. Provision Jane's exact authenticated user ID in `launch_operators` as city tester/wave admin through an operator-controlled database session, never a client-writable role or `user_metadata`. Admit the initial cohort explicitly in `launch_members` without setting `profile_saved_at` or `completed_at`; they must still complete both onboarding steps. Never bulk-grandfather accounts created after staging without reviewing them.

The private app page Settings → Rollout waves displays pending and activated counts and activates the next batch after a concrete confirmation. It does not turn gating on or send invitations automatically. Delivery copy/provider configuration and production activation remain separate launch operations. The staged implementation is not a published TestFlight build.

## Validation

- `npm --prefix mobile run test:location`: 130 checks, including server-driven gating, safe phone normalization, failed saves, double taps, developer capability reset, and account-scoped tip persistence.
- `SPOTTED_PGLITE_MODULE=<pglite> node tests/onboarding/database.cjs`: 16 isolated PostgreSQL cases.
- `SPOTTED_LAUNCH_MIGRATION=1 SPOTTED_PGLITE_MODULE=<pglite> node tests/privacy/release-audit.cjs`: 73 existing privacy/feature checks with the new policies installed.
- TypeScript check and native simulator walkthrough against the test project, with synthetic nominations only. Actual REST requests from an incomplete account receive 403 for profile, invite, recap, rollout-admin and video-upload endpoints.
- Private tables intentionally have RLS with no direct client policies. The API hook intentionally grants execution to request roles and returns no account data. Existing unrelated database advisor warnings are not remedied by this migration.
