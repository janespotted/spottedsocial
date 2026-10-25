# NYC onboarding and invitation waves

New users sign in, save a combined name/username profile, see four short visual introductions, and nominate exactly two distinct eligible phone numbers. There is no skip or choose-later path for nominations. Selections persist server-side; neither account age nor editable auth metadata finishes onboarding. Existing accounts at migration time retain access.

After successful phone verification (or Apple sign-in), admitted new members start with “Make an entrance.” Saving their name and username opens check-in, the map, “Make it a night,” and the leaderboard: one headline, one sentence and a locally rendered illustration per screen. The social page shows Meet Ups, venue invites, DMs and posting to friends, followed by the requested “Everything deletes by 5am - no hangxiety” copy and “Your profile and friends stay.” This wording change does not alter retention or Morning After behavior. The shared frame stays still while content fades and rises 8 points over 220 ms; Reduce Motion removes the transition. Illustrations are examples, never live controls. They request no location permission and do not change status, audience, friends or nominations. Large text can scroll, with a labeled illustration for screen readers. Local progress resumes per account; the four-page version preserves completed three-page tours; it does not grant admission or complete required setup. Already-complete accounts skip the introduction. Members with a saved profile resume any unfinished introduction before the nominations; a failed profile save stays on “Make an entrance.”

Sign-in, profile and nomination copy stays brief, with nomination entry controls revealed after choosing a card. There are no standalone first-use tip cards or Morning After tour screen. Location permission remains contextual at the actual check-in.

## Admission and permissions

The migration introduces private membership, nomination, operator and wave tables. Public RPCs call private implementations with explicit identity checks and hardened search paths. Restrictive table/Storage policies block incomplete members; a PostgREST pre-request hook also blocks legacy SECURITY DEFINER RPCs, including old friend-invite URLs. The hook refuses installation over another configured hook until they are deliberately composed. The video-upload function checks completion before creating a Mux upload. Other private media/contact functions already carry the caller JWT through their database RPC.

Phone numbers are normalized to E.164. A global unique constraint arbitrates concurrent nominations; per-member locks serialize the two slots. Failed eligibility checks consume a bounded hourly check allowance. Completion rechecks registered numbers and requires both saved slots. Only completed nominations can enter a wave. Nominations never create friendships, location consent, or outgoing messages.

Wave activation is admin-only, serialized, bounded to the requested number (1–500), and idempotent by a request UUID persisted before activation, including across app restarts. Activation and notification delivery are separate: this implementation grants phone-bound admission, but does not send SMS. A verified phone can claim its activated nomination exactly once; forwarding a profile/QR link does not grant admission. Apple login remains available. Under invite-only admission, new Apple accounts must verify the invited phone on the same account; there is no Apple-only bypass. Previously completed accounts retain access. Phone-only deduplication cannot identify an existing Apple-only account with no linked phone.

## Internal city testing

New public profiles default to NYC. Ordinary users cannot change city, even via a direct profile update. `spotted_private.launch_operators.city_tester` enables private Settings controls; an environment flag or stored Demo Mode preference grants no permission. Existing trusted night testers and server-owned admin roles initialize these capabilities. City changes reuse the existing city-scoped venues, map, rankings, plans, `cityToTimezone`, and 5 AM reset rules. LA uses America/Los_Angeles.

## Coordinated release

Deploy the migration and updated `mux-create-upload` function with the new app version. The migration preserves existing members, but new users on old builds must update to finish onboarding. Do not deploy the migration by itself to production before an updated app is available.

Wave gating defaults **off** so this migration does not silently switch production to closed admission. Mandatory profile/two-person completion still applies to newly created accounts. At the approved launch, enable `spotted_private.launch_settings.wave_gate` in a coordinated change. Provision Jane's exact authenticated user ID in `launch_operators` as city tester/wave admin through an operator-controlled database session, never a client-writable role or `user_metadata`. Admit the initial cohort explicitly in `launch_members` without setting `profile_saved_at` or `completed_at`; they must still complete both onboarding steps. Never bulk-grandfather accounts created after staging without reviewing them.

The browser Launch Center (`/launch-admin.html`) replaces blind batch activation with named, capacity-limited guest lists, invitation history, and status filters. See LAUNCH-CENTER.md for the current admin workflow, Apple phone verification, delivery configuration, and rollout requirements. Build 53 is published to internal TestFlight. Controlled admission remains off until the initial guest list and external installation link are ready.

## Validation

- `npm --prefix mobile run test:location`: 134 checks, including server-driven gating, safe phone normalization, failed saves, double taps, developer capability reset, protected route groups, and introduction eligibility/resume/storage failures/reduced motion.
- `SPOTTED_PGLITE_MODULE=<pglite> node tests/onboarding/database.cjs`: 16 isolated PostgreSQL cases.
- `SPOTTED_LAUNCH_MIGRATION=1 SPOTTED_PGLITE_MODULE=<pglite> node tests/privacy/release-audit.cjs`: 73 existing privacy/feature checks with the new policies installed.
- TypeScript check and native simulator walkthrough against the test project, with synthetic nominations only. Actual REST requests from an incomplete account receive 403 for profile, invite, recap, rollout-admin and video-upload endpoints.
- Private tables intentionally have RLS with no direct client policies. The API hook intentionally grants execution to request roles and returns no account data. Existing unrelated database advisor warnings are not remedied by this migration.
