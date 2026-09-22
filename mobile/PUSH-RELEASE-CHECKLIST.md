# Notifications release — September 22, 2026

This supersedes the earlier notification checklist. The earlier live send-push
version 14 is NOT this queue-based release. No new production deployment or real
push test was performed for this release.

## Changes

- Durable delivery queue with transactional enqueue, immediate post-commit wake,
  one-minute recovery job, five-attempt limit, backoff, leases, expiry and logs.
- DB triggers own likes, comments, accepted friend requests, post tags and DMs.
  Legacy RPC calls for those types are ignored to prevent double creation.
- Notification ID binds stored sender, recipient, type and content. Clients
  cannot deliver arbitrary payloads or claim queue jobs. Push dispatch requires
  a service credential AND an active job lease.
- Privacy is rechecked at delivery. Blocks, audience restrictions, removed DM
  membership, expired posts and expired nights cancel delivery. Old-bar arrival
  alerts are cancelled if the sender has moved to another bar or private party.
- Tags never disclose the venue in the alert; outside-audience tags do not alert.
- Friends + Mutuals planning recipients are resolved by the server.
- 429/5xx and credential errors retain APNs tokens; invalid-token cleanup uses
  compare-and-clear so it cannot erase a rotated token. Both APNs environments
  are checked for token/environment mismatches. Successful channels aren't
  intentionally resent when retrying another channel. Stable APNs collapse ID.
- DMs open their thread; post alerts open their post; plans open Plans within
  Messages. Expired/deleted objects use existing screen handling.
- Morning After is scheduled at 10am in the profile city's time zone, including
  after-midnight check-ins and DST. A private native recap screen shows available
  own stops/posts; it doesn't expose other people's historical location. It is
  allowed above the nightly gate. It does not implement crossed-path analytics,
  video playback or change existing post-retention policy.
- Daily/weekend campaigns now share a queue, city-local timing and event dedupe.
  Any current Yes/TBD/No answer suppresses reminders. The second reminder requires
  the first to have been accepted by a provider. Old campaign endpoints delegate
  to the scheduler, so they can't bypass timing or suppression.
- Hardcoded badge 1 removed. This release does not implement a global unread badge
  count; existing on-device badges may need clearing by opening/logging out.

## Campaign defaults (NYC and LA local time)

- Sunday–Thursday and Saturday: first reminder at 6pm.
- Friday: weekend prompt at 5pm replaces the 6pm reminder.
- 8pm: at most one follow-up after successful first delivery if still unanswered.
- Campaigns are OFF until explicitly enabled; adjust these product defaults
  before enabling if the desired launch cadence differs.

## Deploy together, first to a staging project

1. Apply the code patch and install mobile dependencies from its lockfile.
2. Apply migration `20260922205151_reliable_notification_delivery.sql` through
   the normal migration workflow. This project's existing pg_cron, pg_net and
   Vault are prerequisites. Delivery/campaign switches default to false.
3. Deploy `send-push`, `process-push-queue`, `send-daily-nudge`, and
   `send-weekend-rally`, with JWT verification ON. Existing APNs and VAPID
   credentials remain in Edge Function secrets; none are included in the patch.
4. In Vault create `spotted_push_url` = the project's base HTTPS URL and
   `spotted_push_service_key` = that project's service-role key. Never use an
   anon/publishable key here or put service secrets in mobile/. Validate the
   worker endpoint's service authentication before activation.
5. During the coordinated cutover, mark pending rows created before the new
   send-push deployment as skipped, to avoid replaying alerts the old handler
   may already have sent. Do NOT backfill historical notifications.
6. Enable transactional delivery as an authorized release operation:

   ```sql
   update spotted_private.push_settings set delivery_enabled = true;
   ```

   Leave campaigns off for the two-phone QA. Confirm cron jobs
   `spotted-push-delivery` and `spotted-push-campaigns` exist, and inspect
   `cron.job_run_details`, `public.push_outbox`, and `public.push_logs`.
7. Build/release a new iOS TestFlight build from this code. The backend can
   handle old RPC callers, but routing, recap and mobile location fixes require
   the new build. After QA, separately enable the approved reminder cadence:

   ```sql
   update spotted_private.push_settings set campaigns_enabled = true;
   ```

Pause delivery with `delivery_enabled = false`. Do not revert just one side of
this release: mobile now relies on DB-owned alerts. A full rollback must restore
old source-trigger/RPC definitions and old Edge Functions together. Keep the
queue paused while doing so; take a schema snapshot before deployment.

## Verification performed

- 36 Node tests passed: location and notification behavior, registration failure,
  account separation, tap routing, midnight/DST, queue-only client responses,
  forged recipients, lease checks, privacy revocation, stored content, APNs
  temporary errors and compare-and-clear token cleanup. Provider calls mocked.
- 45 isolated PostgreSQL checks passed using PGlite 0.3.14: actual migration and
  trigger execution, deduplication, recipients, queue state transitions, grants,
  revoked privacy, obsolete arrivals, campaign cadence and suppression.
  Cron scheduling is stubbed in this fixture; pg_net/Vault integration needs
  staging verification. No production data was mutated by these tests.
- Mobile TypeScript passes. All four Edge Functions pass Deno type checking
  using an import map to the exact locally installed Supabase 2.112.4 package;
  direct esm.sh access was blocked in this environment.
- iOS export status is recorded in the accompanying handoff README.
- Existing live Supabase advisors report unrelated search-path and executable
  definer-function warnings. This migration pins its function search paths,
  restricts grants and tests queue access; it is not a whole-project security
  certification. Re-run advisors after applying it to staging/production.
  Reference: https://supabase.com/docs/guides/database/database-linter

## Physical-device release checks (not yet performed)

Use two authorized test accounts/phones. Verify each in foreground, background,
locked, and a cold start:

- Friend request and acceptance; text/photo/shared-post DM; comment, like, tag;
  meet-up and acceptance; venue invitation and acceptance; plan invitation/down.
- One in-app alert per like, even with legacy clients and unlike/re-like.
- Messages open the right thread; post alerts the right post; plans the Plans tab.
- Friends + Mutuals reaches direct friends and eligible second-degree friends.
  Blocks, hiding, Close Friends and private parties remain private.
- Manual/automatic arrivals notify once; moving again suppresses a delayed alert
  for the previous bar. Test network loss/reconnection and a expired nightly row.
- Token permission off/on, rotation, account switch, logout, offline logout,
  Focus mode and native notification permission behavior.
- 1am check-in gives same-day 10am recap; verify NYC/LA independently. Recap
  opens without forcing the next night's question and cannot show others' data.
- Reminders skip Yes/TBD/No users; no duplicate from repeated cron; no second
  nudge unless the first was delivered and the person hasn't answered.
- Queue expiry, transient retry, permanent failure, and actual APNs receipt.
  Provider acceptance is not proof that iOS displayed the alert.

## Limits retained

One APNs token per account; not multi-device fanout. At-least-once delivery cannot
guarantee zero duplicates after a crash following provider acceptance. The
queue can retry only events committed to the server. Plan/invite/arrival helpers
still need their create-notification RPC to succeed; they are not a durable
client-side offline action queue. Legacy web-only feature screens aren't added
to native by this notification patch. Morning recap can only show retained data.
