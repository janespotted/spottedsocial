# Launch HQ monitoring

The Monitoring tab extends `launch-admin.html` on `codex/nyc-onboarding-waves`. The native iOS audit used `codex/approved-ux-release` at `e8ea2b9`; no native release is introduced by this change.

## Instrumentation audit

| Area | Source and meaning | Coverage |
|---|---|---|
| Launch invites | Private launch guests, claims and completion records | Current list, all time. Manual invitations require “mark invited”; no inferred delivery. |
| Signups / onboarding | Profile creation, launch admission and completion timestamps | Excludes demo, night-mode testers and explicitly excluded accounts; NYC/LA only. Grandfathered members separate. Counts are not a conversion cohort. |
| App opens / active users | Existing `UsageManager`, `record_usage` and private usage ledger | Build 63 source has foreground events, deduplicated server-side for 30 minutes. Older installed apps can undercount opens. A successful social action also establishes observed activity. |
| Plans, chats, DMs, statuses, friendships and in-app invitations | Existing server action triggers | Durable counts survive source cleanup. Friendship acceptance records both participants. |
| Check-ins, posts, comments and likes | New insert-only triggers using the existing recorder | Counts only, no content, venue IDs, coordinates or new entity identifiers. Exceptions cannot abort the product insert. No historical backfill. |
| Push attempts | Existing queue worker writes to `push_logs`; live queue in `push_outbox` | System-wide (including tests). Separates privacy/availability skips from failures. Retries count as attempts. Provider acceptance is not device delivery. Transport exceptions can lack attempt-log rows. |
| Technical health | Readable database snapshot, whitelisted scheduled-job states, existing client failure events | SQL job completion is not external-service success. Client failures currently cover plans, plan chat and DMs. No native crash or full API latency monitoring. |

Usage collection began at `2026-10-21T21:27:19Z`; extended capture began at `2026-10-21T21:43:24Z`. The existing ledger retention is 90 days; the API clamps requests to 1–30 days. Nightly buckets use each recorded profile city’s timezone and a 05:00 boundary. Historical data before collection is unavailable. Raw historical check-ins are not queried.

## Access and privacy

The public RPC is a security-invoker wrapper around a private, fixed-search-path function. It checks both the existing wave-admin permission and the new `founder_monitor` flag against the current database row on every request. Initial access is assigned only to the existing sole wave admin; the migration fails if that assumption is ambiguous. New delegated admins default to no monitoring access. Neither flag can be modified by an ordinary authenticated user.

No anonymous execute grant. No new raw-table access. RLS remains enabled. No service key in the browser. The response contains counts, city/night buckets, fixed labels and operational timestamps; no user IDs, names, phone numbers, message bodies, precise locations, tokens or raw errors. Existing invite-management screens keep their authorized operational behavior.

The UI retains its timestamped snapshot during a routine refresh to keep the page steady, clears it when the period changes or a request fails, clears it on account change/unmount, and ignores cancelled requests. It refreshes once per minute while visible. Preview fixtures require the existing explicit localhost development gate and are eliminated from production builds.

## Deployment and tests

Production backend migration `20261021214324_launch_hq_monitoring` is applied to `rwavbyvdytdegntdryll`. Its timestamp matches the server migration history. It depends on the already-applied `approved_ux_and_retention_build63` backend; do not replay all migrations from the older dashboard branch against production.

Validated:
- Launch dashboard TypeScript check and full Vite production build.
- UI state tests for denied access, missing migration, unavailable refresh, stale/missing/failed jobs.
- PGlite 0.3.14 PostgreSQL fixture: anonymous/ordinary/delegated/revoked access, raw-table and privilege-escalation denial, event capture, read-time exclusions, no sensitive output, time-window bounds, push classification, cron allowlist, DST boundary and recorder-failure isolation.
- Live founder RPC returned aggregates; live ordinary-user denial and anonymous/raw-table/operator-write privileges checked with rolled-back transactions. No test product data inserted into production.
- Desktop and 390px layout review, reporting-period selection, refresh and existing navigation.
- Security advisors: no new WARN categories or counts. One expected INFO for the new RLS-protected private settings table with no client policy. Pre-existing advisor warnings are outside this focused change.

Reproduce the SQL fixture with `PGLITE_MODULE` pointing to a pinned `@electric-sql/pglite@0.3.14` module, then run `node supabase/tests/launch-hq-monitoring.test.mjs`. Run UI tests with `vitest run src/launch-admin/monitoring.test.ts` and typecheck with `tsc -p tsconfig.launch-admin.json`.

## Rollback

Revert the frontend commit to remove the tab. To disable access immediately, clear `founder_monitor` on the private operator row using an authorized database session. The new event capture triggers can be dropped independently without touching product rows. Retain the event enum expansion and private settings when disabling capture; avoid deleting collected history or replaying older migrations.

## Live monitoring and alerts (22 October 2026)

The next additive migration is `20261021220858_launch_hq_live_alerts.sql`. Apply only this migration to the already-current project; do not replay older branch migrations. `launch_monitor_live` wraps the unchanged v1 report and its founder authorization. It adds 15-minute activity, invitation-cohort conversions, fixed-vocabulary client-error aggregates and persistent incident history.

Realtime publishes only the singleton `public.launch_monitor_signal` timestamp. Its RLS policy checks the current private founder role. Every signal causes a fresh authorized RPC, throttled in the UI; visible pages also refresh every 15 seconds, including on return to foreground or network recovery. No raw usage, contact, push, check-in or crash rows enter the publication. Trigger failures are isolated from product mutations. Signal writes are throttled with a nonblocking transaction advisory lock.

The cohort denominator is non-revoked guests marked invited during the selected period. Claim counts require claiming after invitation; completion requires completion after that claim. Both rates use the same invited denominator. A zero denominator is null, displayed as —. Rates are observed through now, so younger invitation cohorts are incomplete.

`spotted-launch-alerts` runs each minute even with the dashboard closed. It creates one open incident per condition, retains acknowledgement without treating it as recovery, resolves the incident when its condition clears, and creates a fresh unacknowledged incident if it recurs. Resolved incidents display for 24 hours and are retained for 90 days. It never sends emails, SMS or app pushes. Optional browser notifications require a user click and the dashboard to remain open; their text contains no metrics or user information. Browser background throttling can delay their display.

| Condition | Threshold |
| --- | --- |
| Push backlog | Any pending/sending item >5 minutes overdue |
| Push failures | At least 3 non-skip logged failures in 15 minutes |
| Terminal push failure | Any failed item remaining in the queue, including transport failure |
| Push switched off | Delivery disabled while work is queued |
| Push job | Queued work, with job absent/disabled or no succeeded/running execution within 5 minutes |
| Client errors | At least 1 eligible report in 15 minutes |
| Product-action failures | At least 5 eligible recorded failures in 15 minutes |
| Invitation SMS | At least 1 failed/undelivered message updated in 15 minutes |

Alert runner freshness is independent of the report timestamp; after 150 seconds the dashboard says the checks are stale. Database outage detection is limited to the open dashboard's failed refresh, because a database cannot monitor its own downtime from inside itself.

### Crash coverage

This release instruments the website's React error boundaries, uncaught JavaScript errors and unhandled rejections. Signed-in production sessions send a heartbeat every five minutes while visible. Only a generated deduplication UUID, fixed kind and platform are accepted; there are no arbitrary metadata, error-message or stack-trace fields. Browser collection is best effort, capped at ten requests/minute. The database independently serializes per-user rate limiting (ten errors/minute) and heartbeat deduplication. Reports are retained for 30 days; demo/test exclusions apply at ingestion and read time. The dashboard is intentionally not counted as product traffic.

No external crash-reporting account exists. **Native iOS/Android process crashes, pre-sign-in errors and reliable post-crash replay remain unconnected.** No mobile binary is released by this change. `native_status` stays `not_connected`; ordinary clients cannot submit a `native_crash` event or claim trusted provenance. Counts are client-reported signals, not a crash-free percentage or authenticated proof of a crash. The native collector must be integrated into the current iOS release branch and tested on device before native coverage can be claimed.

### Verification and rollback

Run the combined PostgreSQL tests with the documented PGlite runtime, dashboard TypeScript, `vitest run src/launch-admin src/lib/client-health.test.ts`, and `vite build`. Tests cover denial for anonymous/member/delegated/revoked roles, private raw-table access, signal-table RLS, invalid and null inputs, demo/excluded users, deduplication/rate limits, exact cohorts, incident acknowledgement/recovery/reopening and forbidden output fields. Browser QA covers existing navigation, period selection, acknowledgment, desktop and 390px layouts. Production must exclude design fixtures.

Rollback the frontend to v1 independently. Disable only the new scheduler with `select cron.unschedule('spotted-launch-alerts')` if needed. Revoke execute on `public.launch_monitor_live(integer)` or clear the existing founder flag for immediate access shutdown. Keep historical reports/alerts; do not drop product tables or replay prior migrations. The change does not widen access to precise locations.
