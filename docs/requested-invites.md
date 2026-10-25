# Website invite requests

Netlify project `spottedapp` serves `joinspottedapp.com`. The active form is `spotted-nyc-invites` (`6aa44b3bf24f7a00081682c2`). Its verified submissions are separate from app invitations, membership, wave assignments, and app acquisition analytics.

## Data flow

Netlify Forms → signed HTTP POST notification → Supabase `netlify-invite-request` → private `invite_requests` → admin-only `requested_invites` RPC → Launch Center `#requested-invites`.

The handler requires an HS256 Netlify JWS and verifies the SHA-256 of the exact request body. JWT gateway verification is disabled because the function authenticates Netlify's signature itself. The signing key is held only in Netlify's notification configuration and the Supabase `NETLIFY_INVITE_WEBHOOK_SECRET` server secret. Never put it in Vite variables, source code, or URLs.

Only the known form ID is accepted. Fields are allowlisted and bounded; client IP, user agent, and arbitrary payload metadata are not stored. The original Netlify submission ID is the primary key. Replays cannot duplicate or overwrite a request or reset its review status. Website phone numbers remain unverified, as submitted.

The table has RLS enabled and no direct anonymous/authenticated grants. Reads and review changes call the existing `require_launch_admin()` guard. The ingestion RPC is service-role-only. Review changes are audited and reversible. No action here sends messages, assigns waves, creates members, or changes the 127-person planning pool.

## Connection and recovery

Create a Netlify Forms HTTP POST notification for this specific form, targeting:
`https://rwavbyvdytdegntdryll.supabase.co/functions/v1/netlify-invite-request`
Set the same JWS secret as the server secret. Once saved, record `enabled_at` in `spotted_private.invite_request_connection`. `last_delivery_at` advances only when a signed notification is successfully saved (including an idempotent retry); `last_backfill_at` is distinct.

The dashboard reads every 15 seconds while visible, and on opening/Refresh. This is webhook delivery plus periodic dashboard refresh, not a Netlify-wide polling sync. A quiet form does not prove the webhook is broken. Netlify source records remain available for reconciliation. Netlify spam/deletion changes after delivery are not automatically propagated. For a missed delivery, import the verified source submission through `ingest_invite_request(..., true)` using an authorized backend session; the stable ID makes repeat backfills safe.

Initial backfill uses the 20 verified submissions visible on October 22, 2026. Personal data exports stay outside Git. No invented request is added to production for testing.

## Validation

- `node_modules/.bin/tsc -p tsconfig.launch-admin.json --noEmit`
- `node_modules/.bin/vitest run src/launch-admin src/lib/client-health.test.ts`
- `PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test supabase/tests/requested-invites.test.mjs`
- `node_modules/.bin/vite build`

The integration tests cover signature/body binding, expiration, wrong forms, invalid inputs, honeypot/spam rejection, payload limits, unavailable storage recovery, anonymous/member denial, service-only writes, duplicate deliveries, search, optional phones, reversible review and revoked admin access. Browser checks cover details, filter/search, empty results, review/undo, keyboard dismissal and navigation. A signed replay of an existing source request can verify the deployed endpoint without adding a person.
