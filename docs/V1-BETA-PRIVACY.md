# V1 beta privacy remediation — cumulative developer handoff

Branch: `chatgpt/v1-privacy-remediation`.
Integration baseline: `edd09659d1a78b2ad5678826913043b79074a983`, incorporating developer `feat/ios-native` at `8a49674de8823e230a9e592b8d6e053d4bfe03f5` and release at `38c4b968dbf08ea6a0f08237b7b64a2999d67da6`.
Previous remediation stage: `32262ddc71d26ccbd0f1dac6cdf214a7b2c2db57`.
The task's external report records the final committed/tested SHA and remote verification. No database, Edge Function, Storage/Mux configuration, app binary or deployment was changed by this task. No merge into another branch was performed.

## Status and evidence boundaries

**Closed in branch regression, not deployed:** P0-01–05 and P0-07–15. The first-stage consent/audience/location/address/cache/DM exploits continue to be denied with all five remediation migrations loaded. New P0-09–14 cases reproduce the old exposures at the previous remediation state and deny them after these changes. See the test ledger, not simply the existence of changed code.

**P0-06 remains open as an end-to-end rollout finding:** the authorization/gateway/cleanup code has passing negative and positive tests, but historical public Storage URLs, already signed URLs, public Mux playback IDs and real external media must be inventoried, converted/revoked and tested through the actual providers/CDN. Code changes alone cannot establish their revocation. The previous stage's media inventory and exact conversion instructions remain in `V1-PRIVACY-REMEDIATION.md`.

No production P0 is declared resolved by these local results. PGlite executes real PostgreSQL functions, triggers, RLS and grants against captured metadata with synthetic rows. It does not run hosted PostgREST, Realtime, Storage HTTP/CDN, concurrent database sessions, APNs, native AVPlayer or Mux. Native tests transpile actual source with mocked UI/transport; an Expo iOS export is not a signed Xcode build.

## New findings, roots and corrections

| Finding | Root cause → implementation | Negative and positive evidence |
|---|---|---|
| P0-09 | Public raw phone lookup and anonymously callable graph helpers exposed identity/relationships. Client matching now requires a real authenticated account, validates/bounds the request and calls a caller-JWT RPC; a locked private usage row applies the same quota to Edge and direct RPC calls. Raw `match_phones` is service-only. Graph helpers are authenticated/caller-bound and use current canonical unblocked relationships. | Anonymous/anonymous-Auth/raw-helper/impersonated-viewer calls denied; invalid/oversized batches, quota bypass and blocked matches denied. Real submitted contacts, dedupe, actual eligible mutual discovery and separate account budgets succeed. No address books are stored. |
| P0-10 | Child table policies did not inherit plan visibility; raw writes bypassed parent/audience/expiry, and legacy blocked pairs could remain visible. Parent and all four children now share canonical authorization. Native create/edit uses one `save_plan` transaction; participant eligibility and venue/owner fields are server validated. Identity guards, unique interactions and parent cascades protect updates/deletion. | Hidden/expired/blocked plan reads and child writes denied, including INSERT without RETURNING; normal friends cannot be tagged into Close Friends plans. Eligible friends/close friends can read, vote/comment/react, and atomic create/edit/rollback and city expiry pass. |
| P0-11 | Parked native UI left Yap tables and RPCs exposed. Client table/column grants are revoked for all five Yap UGC tables and public Yap RPCs. Native route, directory/query/subscription and helpers are removed. Service cleanup access remains. | Old anonymous private reply/author retrieval, writes and callable vote RPC reproduced then denied; all client Yap grants sealed. Service cleanup and unrelated venue reads pass; supported native routes remain present. No Yap authorization, anonymity, notification or UX rebuild. |
| P0-12 | RLS exposed a peer's private read position even with receipt sharing off; native raw profile reads were not a valid authorization boundary. New receipt RLS requires exact direct-thread membership, both users' opt-in and no block for peer reads; own read positions remain writable/readable privately. | Either user's opt-out, block, group peer read and nonmember write denied. Both-opted-in direct peer reads and private direct/group unread tracking succeed. Native Seen uses only server-authorized results and clears/revalidates on focus, foreground, error and 15-second refresh. |
| P0-13 | Delivery checks did not protect stored inbox payloads; plan alerts had no source ID and could be manufactured by generic RPC. Plan interaction triggers now compose notifications with exact plan ID/revision. Restrictive inbox SELECT and queued delivery both validate current source authorization. Native inbox clears on lifecycle boundaries/errors and refreshes. Clients can update only `is_read`. | Forged single/batch plan alerts, source-less historic plan alerts and revoked/expired/deleted/edited source text denied. Tests cover participant removal, stop, post friendship removal, retained/deleted DM source, party consent and canceled friend requests. Valid plan/source alerts, mark-read and push-opt-out Activity remain; direct-friend venue invites and eligible mutual meetups pass. |
| P0-14 | Public/client push-log policies exposed other users' delivery metadata and permitted fabricated logs. Remove policies and table/column client privileges; service access remains. | Anonymous/unrelated SELECT and client INSERT denied; service logging still succeeds. |

## Behavior changes and preserved behavior

Intentional changes:

- Yap is unavailable in this native beta and through client APIs. Existing old Yap deep links do not reopen a feature. Service deletion/reset still has access; venue browsing, hours/photos/directions, invites and leaderboards are not redesigned.
- Contact matching checks the first 500 native contacts and tells the user when limited; backend permits 1–500 valid numbers, 16 KiB HTTP body, 20 requests/1,000 distinct submitted numbers per hour and 40 requests/2,000 numbers per UTC day per account. Repeated numbers across requests consume budget again. Failures/rate limits show an error/retry or invite-link option instead of a false empty result. Matching intentionally reveals membership only for eligible numbers submitted by the caller; it is not a zero-disclosure contact system.
- Plan participants must be eligible for the plan's current audience. Changing to Close Friends removes ineligible selections. Invalid saves fail atomically rather than leaving a partial plan. Meaningful edits invalidate old notification copy; unchanged participant rows do not receive a replacement push merely because the plan is edited. Delete removes only notifications for that exact plan.
- Source-less historical plan notifications are hidden/skipped rather than guessed back to a plan. Revoked sources disappear from Activity and cannot newly deliver. Push opt-outs alone preserve authorized Activity history. Activity may temporarily clear on foreground/network error; already delivered notification banners or downloaded content cannot be retracted.
- Receipt timestamps are private unless both users currently opt in to an exact direct thread; group unread tracking stays private. On-screen receipts/Activity refresh within the polling interval or lifecycle revalidation, not as instant remote erasure. Offline server mutations take effect only when committed.
- Generic notification creation is limited to existing venue/meetup/invite-accepted types and eligible relationships; eligible mutual meetups are explicitly preserved. Plan/status/DM/post/Yap/unknown generic notifications cannot be forged. Full generic invitation source/rate-limit redesign (P1-12) remains outside scope.

Positive tests preserve legitimate friendship recipient acceptance, invitation redemption, close/mutual audiences, last-known authorized GPS timestamps, explicit party invitation-versus-address approval, exact direct chats and groups, account token refresh, normal private media delivery, contact matching, Plans, unread state, venue reads and valid notifications. No unintended legitimate behavior break was observed in the executed tests. Device/rendering/provider behavior remains unverified.

All five Complete Notification Release patches remain incorporated. Their location dwell/quality/departure/retry/revision rules, planning/location preferences, consent/address-free notification copy, leases/retry/dedupe, routing, recap and cleanup behavior were not replaced. Their existing regression suites pass; the new source predicate intentionally tightens inbox/delivery privacy. No original release migration was edited in this stage.

## Exact backend review and eventual rollout

Do not execute deployment commands as part of this handoff. Rehearse with an approved staging copy and record its schema/grants first. The five remediation migrations, in order, are:

1. `20260924185844_v1_privacy_authorization.sql` — prior stage: friendship/close/block/audience consent, raw-column restrictions, active/unexpired location, party address and exact direct DM authorization.
2. `20260924191106_v1_private_media.sql` — prior stage: private Storage, media ownership/registry, authenticated lookup, cleanup queue/triggers and cron wrapper.
3. `20260924213821_v1_beta_access_closure.sql` — new: contact quota table/RPC and graph grants, captured service-only phone adapter, Yap client access closure, service-only push logs. `spotted_private.storage_key(text)` remains the pure parser required by authenticated expression-index maintenance.
4. `20260924213834_v1_plans_inbox_privacy.sql` — new: plan revision/RLS/guards, atomic save, unique interaction indexes, parent FKs/cascades, source-generated plan alerts, source-filtered Activity/delivery, generic RPC restrictions and exact-plan notification cleanup.
5. `20260924213939_v1_read_receipt_privacy.sql` — new: server-enforced peer receipt opt-in plus own unread-state policies.

These depend on the release/integration migrations already present on the branch; do not apply an overlapping package again. Do not deploy captured test SQL as a baseline. Migration history alone is insufficient because the audited backend had drift.

New Edge change: deploy the reviewed `match-contacts` implementation with `_shared/contact-matching.ts`; it validates Auth and forwards the user's JWT to `match_contacts`, with no service-role lookup fallback. Keep JWT verification enabled and validate actual hosted Auth/PostgREST responses. No new secret is required for contacts.

Cumulative prior Edge rollout also requires `private-media`, `private-media-cleanup`, `mux-create-upload`, `mux-webhook`, `delete-account` and the shared Mux modules; review `supabase/config.toml`. Existing `mux-cleanup`, `daily-cleanup`, `send-push` and `process-push-queue` must remain compatible and working; this stage does not redeploy or rewrite them. Required prior media secrets: server-only `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`, `PRIVATE_MEDIA_PROXY_KEY`, existing Supabase/Mux API/webhook secrets and existing Vault configuration. The original handoff details formats and conversion scripts. Do not print secret values or push unrelated local Auth/test-phone configuration.

### Data and compatibility preflight

- Compare deployed function bodies, all table/column grants, views and policies with the captured audit and all five migrations. Review any newer operator changes rather than overwrite them. Rehearse clean and upgrade paths and hosted Realtime payload authorization. New client RPCs must exist before the compatible binary uses them.
- Review duplicate friendship pairs, ambiguous historical accepted consent and duplicate `posts.mux_upload_id` from the prior stage. Historical consent cannot be reconstructed by these code fixes; use a reviewed reconciliation/reset for unverifiable relationships, not a silent blanket delete.
- Review duplicate `(plan_id,user_id)` in `plan_downs`, `plan_votes`, `plan_participants`. The migration intentionally fails if duplicates prevent unique indexes. Resolve with a documented owner/product decision before retrying; it does not silently discard votes/participation.
- Review orphan rows in those three tables. New FKs are NOT VALID: new writes/deletions are enforced, existing orphans remain unreadable for explicit reconciliation. Validate each FK after approved cleanup. `plan_comments` already has its parent FK.
- Review unknown/null plan audiences and source-less old plan notifications. Invalid private sources fail closed; do not invent source IDs. Measure index-lock duration and query performance on a realistic copy. Test parallel save/contact-quota/friendship/DM calls on actual PostgreSQL, since PGlite runs one connection.
- Gate incompatible old binaries/web surfaces. Old raw-coordinate/media/Yap/legacy plan-notification paths fail closed. An unsupported web client must not be offered as a beta workaround. Preserve service-only account deletion/night reset, and verify actual service cleanup of legacy Yap data.
- Follow the previous media conversion instructions for `scripts/secure-existing-storage.ts` and `scripts/secure-existing-mux.ts`; both `--apply` paths mutate providers/data and were NOT run here. Confirm old public/signed/CDN URLs deny bytes before closing P0-06.
- Verify queue wakeup, retries, cleanup cron, secrets/permissions and monitoring in staging. Keep campaign activation unchanged. No new deployed worker configuration is assumed.

Read-only duplicate/orphan preflight examples (run only by the developer in the approved environment):

```sql
select 'downs' as source, plan_id, user_id, count(*) from public.plan_downs
 group by plan_id,user_id having count(*)>1
union all
select 'votes',plan_id,user_id,count(*) from public.plan_votes
 group by plan_id,user_id having count(*)>1
union all
select 'participants',plan_id,user_id,count(*) from public.plan_participants
 group by plan_id,user_id having count(*)>1;

select 'downs' as source,count(*) from public.plan_downs c
 where not exists(select 1 from public.plans p where p.id=c.plan_id)
union all
select 'votes',count(*) from public.plan_votes c
 where not exists(select 1 from public.plans p where p.id=c.plan_id)
union all
select 'participants',count(*) from public.plan_participants c
 where not exists(select 1 from public.plans p where p.id=c.plan_id);
```

## Reproducible local validation

```sh
SPOTTED_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/privacy/authorization.cjs
SPOTTED_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/privacy/beta.cjs
npm --prefix mobile run test:location
npm --prefix mobile run typecheck
SPOTTED_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/notifications/database.cjs
SPOTTED_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/notifications/coverage.cjs
deno test --no-lock supabase/functions/_shared/private-media.test.ts supabase/functions/_shared/contact-matching.deno.ts
deno check --no-lock supabase/functions/*/index.ts scripts/secure-existing-mux.ts scripts/secure-existing-storage.ts
npm run build
# In mobile/: CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform ios --output-dir /path/to/output
```

Set `SPOTTED_BETA_RESULTS=/path/to/results.json` for the new assertion ledger. Baseline `expected:false` means the intended denial was absent in the previous code: this is an exploit reproduction, not a test failure. Expected values are compared before and after. The original 121-assertion harness uses the audited integration baseline; the new 97-assertion harness uses the previous remediation state (31 baseline: 24 exposures + 7 controls; 66 corrected). Original location SQL also runs unchanged against the fully corrected schema.

Results expected from the final recorded run: 121 original authorization assertions, 97 beta privacy assertions, 54 native tests, 18 Edge tests, 45 notification checks, 35 nightlife/party checks and 29 location SQL assertions pass. Native TypeScript, all 17 Edge entry points/two operator scripts, web production build and Expo iOS export pass. The six new native tests cover actual plan/receipt/inbox source plus native route exclusion; seven new Edge tests cover the real contact handler. Original account-switch/cache/media tests remain included.

Existing failures remain visible: web Vitest 19 pass/5 fail plus collection failures (8 failed test files in total); web TypeScript 52 diagnostics; root lint 337 errors/123 warnings; native lint 11 errors/9 warnings. They were not suppressed. No changed web implementation is responsible for the five existing mock failures; lint totals decreased as parked Yap code and an inherited contacts `any` were removed. Passing bundles do not override these failed gates. No signed Xcode archive or actual TestFlight/device execution was performed.

## Remaining P1 judgment for a 100-person native beta

- **P1-03, fix before beta:** enforce normalized username uniqueness and a safe availability API after resolving existing duplicates. Identity collisions are relevant even with 100 invited users.
- **P1-04, capacity gate before beta:** prove realistic burst fanout drains within delivery TTL or add bounded draining/continuation. The existing worker claims only 20 per invocation; worst-case 100 fully connected first-Out events produce 9,900 jobs. This arithmetic is a risk model, not a measured APNs failure. Do not rely on privacy fixes to fix delivery capacity.
- **P1-11, resolve before beta if credentials remain valid:** determine validity/privileges through the authorized owner and revoke/rotate tracked credentials; remove them from working documentation and review exposure. No credentials were used or reproduced here; no compromise is claimed.
- **P1-10, release gate:** establish valid background-location SDK licensing and signed-device Always/background/locked operation for the beta period. The audited checklist identified an October 7, 2026 trial expiry; that is not proof the installed binary is licensed or broken.
- **P1-02, deployment gate:** reconcile this upgrade against the actual schema/data, then prove replay and effective policies/grants. This does not require rebuilding parked product surfaces or every unrelated collector before beta.
- **P1-05/P1-07, acceptance gates:** actual Mux ready-before-post/retry/deletion and real OTP/onboarding/relaunch/offline recovery must pass. Media race handling is improved/tested in the first stage; provider and device evidence remains. Onboarding error-state handling remains open; block the beta if acceptance tests reproduce misrouting/inability to resume, rather than label every legacy branch a blocker.
- **Not automatic native privacy blockers solely from remaining legacy code:** P1-06 residual likes/counters/orphans, P1-08 unsupported web party flow, P1-09 unrelated web failures, and the remaining eligible-peer copy/spam portion of P1-12. Gate old clients, keep failing checks visible, and fix supported native errors that represent actual broken behavior. Native lint remains a failed engineering gate requiring developer resolution or an explicit reviewed waiver; no clean lint claim is made.

P1-01's earlier external delivery configuration resolution is inherited; real provider delivery still needs verification. No new P1 changes beyond the scoped authorization work are claimed complete.

## Exact remaining iPhone/TestFlight and staging acceptance

Use owner A, Close Friend B, normal friend C, actual mutual D and unrelated E on separate authenticated devices/accounts, with release logging free of private payloads. Inspect API/Realtime results as well as visible UI.

1. **Build provenance:** record the installed TestFlight marketing version and build number (`CFBundleShortVersionString` and `CFBundleVersion`), then provide its App Store Connect/EAS/Xcode build record containing the Git SHA and environment. Version/build alone does not prove source correspondence. Test this final remediation commit in a newly traceable signed binary; no claim is made about the user's currently installed binary.
2. **Contacts/graph:** allow/deny Contacts permission, zero contacts, duplicates, >500 contacts, known friends/new matches/blocked matches; hourly/day quota and retry/invite-link UX. Verify logged-out and anonymous-Auth Edge/direct RPC calls cannot return identities, and account B has its own quota.
3. **Plans:** create Friends/Close Friends plans, tag eligible/ineligible users, edit date/city/audience/participants, vote/down/comment, retry failed saves, delete one of two plans. Check invite/down push and Activity, exact deletion, expiry/5 AM in NYC/LA/Lahore, block/removal and historical source-less notifications. Confirm mutual meetup send/accept and direct-friend venue invitations still work.
4. **Receipts/unread:** both on, each side off, block, remove thread member, group thread; Seen should disappear on revalidation while private unread badges continue. Change preferences on the other device while thread is foreground, background/foreground, reconnect and cross a night boundary. Hosted Realtime must not expose unauthorized receipt payloads.
5. **Activity/push:** receive location/plan/post/DM/party/friend-request alerts, then hide/block/remove/stop/expire/edit/delete/cancel their sources. Refetch, background/foreground and cold launch; unauthorized text must not return, queued jobs must be skipped. Muting push alone must keep authorized inbox history. Already delivered OS banners cannot be retrospectively erased by these policies.
6. **Yap/venues:** old `/yap-thread` deep links and old Yap API calls fail closed. Plans/DM tabs remain usable. Verify venue hours/photos/map directions/sharing/invites/wishlist/leaderboard, and service account-deletion/night-reset cleanup of legacy Yap rows.
7. **Original audience/consent:** legitimate recipient acceptance, requester's forged self-accept, Close Friends changes/removal, 30-second one-use Undo and block/unblock across feed/map/cards. Actual eligible mutual reads succeed; blocked/normal friends cannot read Close Friends content.
8. **Location:** walk real venues foreground/background/locked, 75-second/three-sample dwell, quality/speed/ambiguity/departure, offline latest-sample retry and manual revision races. Test Always permission loss, automatic toggle, manual corrections, Out→TBD/Home/Stop, expired state, app restart/city change/exact 5 AM. Preserve original last-known capture timestamp without making it appear fresh. Test license validity through the beta period.
9. **Private party:** accept invitation without address, explicitly approve address, normal friend neighborhood versus eligible close pin, hide/block/remove/end/restart/expiry. Restart without coordinates must not expose the old pin. Raw address/legacy RPC/Realtime paths must deny unapproved viewers.
10. **Account switch:** prime A's private feed/cards/plans/Activity/DM/media/recap, delay response headers and bodies, switch to B online and offline, then release A responses. No A cache/query callback/player image/background task may populate B. Repeat A→logout→A and token refresh; refresh must not reset navigation.
11. **DM:** pre-create A/B/C group, then start A↔B direct conversation both directions; exactly two members, one canonical direct thread, no C message/push. Existing group creation/messages/name/photo continue.
12. **Media and deletion:** photo/HEIC/video/DM photo/group avatar/shared-post/profile/own recap retrieval/upload/retry. Copy raw/gateway/HLS master/variant/segment/key/thumbnail URLs to logged-out/unauthorized/blocked/expired/deleted contexts. Test real AVPlayer auth propagation, audio/seek/range/resume/token refresh/network recovery. Verify all legacy public/signed/warm-CDN paths revoked after conversion, and deletion/account-deletion/orphan queues retry through real provider errors. Measure gateway load/latency.
13. **Delivery and lifecycle:** APNs foreground/background/terminated/cold-tap routing, friend/plan/party/address/DM/post notifications, dedupe, settings, token rotation, retry/leases and recipient switching. Realistic ~100-user bursts and cron recovery must drain in time. Check 5 AM reset/recap/cleanup and only intentionally enabled campaigns. Exercise fresh OTP signup, duplicate username handling, tour completion, logout/login, offline recovery and relaunch.

## Files changed in this extension

The cumulative file manifest against `edd09659` is attached to the external task report. This extension relative to `32262ddc` changes:

- `docs/V1-BETA-PRIVACY.md`
- `docs/V1-PRIVACY-REMEDIATION.md`
- `mobile/src/app/(tabs)/(messages)/messages.tsx`
- `mobile/src/app/_layout.tsx`
- `mobile/src/app/contacts-sync.tsx`
- `mobile/src/app/create-plan.tsx`
- `mobile/src/app/edit-plan.tsx`
- `mobile/src/app/thread.tsx`
- `mobile/src/app/venue.tsx`
- `mobile/src/app/yap-thread.tsx`
- `mobile/src/components/plan-card.tsx`
- `mobile/src/components/plan-form.tsx`
- `mobile/src/hooks/use-notifications.ts`
- `mobile/src/lib/database.types.ts`
- `mobile/src/lib/dm.ts`
- `mobile/src/lib/night-boundary.ts`
- `mobile/src/lib/notifications.ts`
- `mobile/src/lib/plans.ts`
- `mobile/src/lib/yap.ts`
- `mobile/tests/beta-privacy.test.cjs`
- `supabase/functions/_shared/contact-matching.deno.ts`
- `supabase/functions/_shared/contact-matching.ts`
- `supabase/functions/match-contacts/index.ts`
- `supabase/migrations/20260924213821_v1_beta_access_closure.sql`
- `supabase/migrations/20260924213834_v1_plans_inbox_privacy.sql`
- `supabase/migrations/20260924213939_v1_read_receipt_privacy.sql`
- `tests/privacy/README.md`
- `tests/privacy/authorization.cjs`
- `tests/privacy/beta.cjs`
