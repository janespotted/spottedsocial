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

The UI clears a report before refetch, on failure, and on account change/unmount, and ignores cancelled requests. It refreshes once per minute while visible. Preview fixtures require the existing explicit localhost development gate and are eliminated from production builds.

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
