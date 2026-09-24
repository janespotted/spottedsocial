# V1 privacy remediation — initial-stage coder handoff

This document records the first stage at `32262ddc71d26ccbd0f1dac6cdf214a7b2c2db57`. Its remaining-findings list and test counts are historical. The cumulative current handoff is [V1-BETA-PRIVACY.md](V1-BETA-PRIVACY.md); retain the detailed media conversion instructions below.

Branch: `chatgpt/v1-privacy-remediation`. Base: `chatgpt/latest-source-audit-integration`, audited commit `edd09659d1a78b2ad5678826913043b79074a983`. Work was confined to the new branch. No production database, Storage, Mux, Edge Function, app binary, configuration or deployment was changed by this task.

“Fixed in local regression” below means a synthetic exploit reproduced against the captured audited schema/client behavior and was denied by the corrected implementation. It does not mean production is fixed. The upgrade must be reviewed and rehearsed against a staging copy. PGlite does not emulate PostgREST, Storage HTTP/CDN, hosted Realtime, concurrent PostgreSQL connections, APNs, native rendering or Mux infrastructure.

## Finding-to-change mapping

| Finding | Root cause and correction | Evidence / boundary |
|---|---|---|
| P0-01 | INSERT/UPDATE policies allowed forged accepted relationships and requester acceptance. Transition guards permit only own pending INSERT and unchanged pending→accepted by the recipient. An unordered-pair unique index and transaction locks prevent duplicate pairs. | Old accepted INSERT, self-accept and endpoint-reassignment exploits reproduced; corrected writes denied. Legitimate recipient acceptance and owner-issued invite-code redemption pass; redemption is caller-bound, capacity-locked and uses one pair row. Existing accepted rows cannot retrospectively be certified as consensual. |
| P0-15 | Close Friends authorization survived removal; block cleanup was multiple client writes. Canonical audience checks require a currently accepted, unblocked friendship. Server triggers revoke both directions' close grants and friendships on block; removal/Undo is transactional and caller-bound. | Residual-close and block/unblock exploits denied. One-use 30-second Undo passes; blocking invalidates Undo. Undo restores only the remover's own former close selection, not another person's revoked close consent. |
| P0-02 | Additive post policies ignored post audience/block; client-owned demo flag bypassed audience. Canonical post policy uses current graph, expiry and trusted author profile, with parent checks on comments/likes/tags/comment likes. User changes to profile demo identity are denied. | Normal/blocked friend denied close post, comment and media; actual close friend and actual eligible mutual succeed; unrelated viewer and fake row-level demo flag denied. Plan/Yap/inbox findings remain separately open. |
| P0-04 | Status/planning policies and notification predicate used inconsistent audiences; permissive check-in policy bypassed retention. Stored planning audience (or the owner global audience when NULL means inherit) is authoritative in reads and delivery; other-user check-in history is limited to 30 days and current location authorization. | Old planning metadata/alert/queued-delivery and 40-day-history exploits reproduced and denied. Eligible recipients remain supported. |
| P0-05 | Profile coordinates and alternate status/check-in paths outlived active sharing. Safe projection requires active unexpired Out, audience/block/hide permission, current-night capture timestamp and no private-party mode. Status transitions clear profile sharing atomically. Raw sensitive columns are not selectable by API clients. Party pins additionally require their own expiry; restarting without a new pin clears the old pin. | Home/TBD/off/expired/previous-night GPS denied; raw coordinate paths denied; expired posts denied; expired/restarted party pin denied. Authorized 20-minute last-known sample retains its original capture timestamp. The active-Out flag denotes status, not a newly captured GPS sample. |
| P0-03 | Raw address column and legacy get_party_address bypassed consent. Column grants deny raw/star/row-JSON reads; legacy RPC delegates to approved_party_address. | Unapproved raw/JSON/legacy reads denied. Invite acceptance still returns no address; explicit address approval succeeds; blocking revokes access. |
| P0-08 | Shared unscoped QueryClient/module stores and delayed A responses survived switching to B. Synchronous identity revision clears/cancels queries, namespaces every query hash, clears module stores and remounts account UI. Transport headers AND body decoding reject responses from an older identity. Audience preference is account-scoped. | Audited unscoped cache returns A to B before correction. Corrected cache, ignored-abort delayed query/response/body, module reset and preference tests pass. Token refresh retains account caches; protected media refreshes its request token and avoids native byte caching. Native rendering still needs device validation. |
| P0-07 | Direct-thread lookup matched any thread containing both users. New RPC requires non-group and exactly those two members; private pair registry gives one canonical result. | Actual and mislabeled three-member groups are never returned. A→B and B→A reuse the same exact-two-member direct thread. Existing groups remain groups. Historical messages already sent to a group are not rewritten. |
| P0-06 | Public Storage buckets/public Mux playback let raw URLs bypass parent authorization; deletion missed nested paths. Private buckets plus restrictive download/signing policy require authenticated byte delivery, checked against a current post/thread/group on each request. Signed Mux HLS resources remain behind the gateway; encrypted resource URLs do not expose provider tokens. Parent deletion queues exact Storage keys; orphan uploads and account deletion queue media cleanup. | Old bucket/URL authorization and foreign-path laundering paths reproduced; new SQL/gateway tests deny unauthorized retrieval, block/expiry/deletion/revocation and copied segment URLs. **Deployment/conversion dependent:** old public Mux IDs and old Storage signed/public URLs are not revoked merely by merging this code. See rollout gates. |

## Native V1 media inventory

- Feed/detail/profile and shared-post preview photos: `post-images/<user UUID>/…`; new writes use `<user UUID>/private-v1/<timestamp>.<ext>`. Owner recap may retrieve a retained own image created within 36 hours; this does not grant another user access to expired content.
- One-to-one/group message photos: formerly `<user UUID>/dm/<thread UUID>/…`; new writes use `<user UUID>/private-v1/dm/<thread UUID>/…`. Current thread membership, sender existence, block rules and the viewing user's city-night boundary are checked. Possession of a key does not grant access.
- Group avatars: `group-avatars/<thread UUID>/…`, now with `private-v1/` after the thread ID. Current group membership is required; these intentionally persist beyond the nightly DM window while the group/reference exists.
- Feed/detail/profile/shared-post Mux videos and thumbnails: owner-bound upload registry, signed playback IDs, server-only RS256 signing, authenticated HLS/thumbnail gateway. Nested playlists, segments and key URIs are encrypted and reauthorized; provider credentials never go to the app. Native source explicitly uses HLS for Mux and disables caching.
- Public profile avatars in `avatars` remain public product identity images. Public external seed/demo imagery remains public. Real users' new post media cannot point to arbitrary external URLs; existing real external URLs need inventory/import/quarantine before declaring the legacy-media finding closed.
- Parked Yap uploads can use `post-images` or `yap-media`. `yap-media` is made private and direct retrieval denied; no new Yap viewer was built. A Yap-only object in `post-images` has no authorized V1 parent and is not served. Parked Yap text/author/comment API issues are **not** resolved by bucket privacy.

## Migrations and backend review

Apply only after review, in order:

1. `20260924185844_v1_privacy_authorization.sql`: policies/column grants, consent transitions, cleanup/Undo, canonical audience, state/expiry rules, caller-bound own/demo status RPCs and a whitelisted atomic status/address mutation and exact-pair DM registry. The existing `record_live_location` implementation is retained, with SECURITY DEFINER required to read newly protected columns. It already binds all writes to `auth.uid()`, validates inputs/state/revision under a row lock and fixes `search_path` to empty. Recheck this invariant if rebasing onto another implementation.
2. `20260924191106_v1_private_media.sql`: private buckets, restrictive Storage policy, parent/media ownership guards and lookup indexes, Mux upload registry, cleanup queue/triggers, operator-only path rotation RPC and hourly cleanup invocation.

The migrations use public application objects and Storage policies; they do not alter Realtime's internal schema. Private helpers are sealed except the pure `storage_key(text)` normalizer, which writers need to maintain expression indexes. That helper has no data access or authorization capability. New service RPCs/queues are denied to app users.

Preflight against the real schema/data:

- Compare the deployed functions/policies/column grants with the captured audited baseline; do not assume migration history alone is complete (P1-02).
- Review duplicate unordered friendship pairs and duplicate non-null `posts.mux_upload_id`. Unique index creation intentionally fails rather than silently deleting or choosing user data. Example: group friendships by `least(user_id,friend_id), greatest(user_id,friend_id)` with `having count(*)>1`.
- Review historical accepted relationships, residual close grants, invalid/null audiences, forged demo identities, duplicate/malformed direct threads and existing orphan content. The code cannot infer historical consent. Do not blanket-delete legitimate relationships.
- Inventory all existing Storage layouts, external real-user image/video URLs, Mux assets/public playback IDs and posts with upload IDs but no asset IDs. Resolve owner attribution and in-flight legacy Mux uploads before conversion. The Storage conversion script fails on unknown layouts; it does not guess an owner.
- Check index build duration/locks and gateway query plans on realistic data. Test pair-lock concurrency and serializable/repeatable-read transactions on real PostgreSQL; PGlite's single connection cannot prove concurrency behavior.

Review/deploy the two new Edge Functions `private-media` and `private-media-cleanup`, and changes to `mux-create-upload`, `mux-webhook`, `delete-account` and `_shared/mux`. No function is deployed by these migration files. Review `supabase/config.toml`: `private-media` verifies a user through Auth itself and rechecks the SQL parent; cleanup requires the service credential. Keep the existing Mux cleanup worker/queue functioning.

Required server secrets: existing Supabase/Mux API/webhook secrets, plus `MUX_SIGNING_KEY_ID`, base64 PEM `MUX_SIGNING_PRIVATE_KEY` (PKCS#1 or PKCS#8) and `PRIVATE_MEDIA_PROXY_KEY` (base64 32 random bytes). These must remain server-only. The cron wrapper uses existing Vault names `spotted_push_url` (project base URL) and `spotted_push_service_key`. Verify their validity without exposing values. The app continues to use its existing public Supabase configuration.

## Legacy-media rollout gates — operator action, not executed here

Use an approved maintenance/compatibility window. Old clients selecting raw sensitive columns, minting Storage URLs, setting public group-photo URLs or creating unregistered Mux uploads will fail closed after migration. Ship the compatible native client together with backend changes; explicitly gate unsupported old/web clients. Do not restore broad grants to make them work.

1. Rehearse migrations, Edge Functions and client against staging. Provision signing/proxy secrets and verify authorized playback before enabling uploads. Build a source-to-binary provenance record.
2. Review and, only when authorized to deploy, run `scripts/secure-existing-mux.ts --apply` with operator-only credentials. It verifies provider ownership, creates/reuses a signed playback ID, deletes **every public playback ID**, verifies their absence, then updates the post. Failures stop conversion. Inventory incomplete/no-asset legacy uploads and orphan provider assets separately; no blanket “all old assets secured” claim is made by this script.
3. Review and run `scripts/secure-existing-storage.ts --apply` during the media-write window. It inventories nested keys, copies old V1 files to new private paths, atomically rewrites post/DM/group references via the service-only RPC, then deletes old objects through Storage. Old keys remain durably queued if physical deletion fails. The script skips new `private-v1` keys and stops on unknown owner layouts. Resolve any legacy orphan/unsupported/Yap objects and outstanding URLs explicitly.
4. Confirm old public AND previously signed Storage URLs no longer return bytes, including warm CDN paths and transformed-image URLs. Confirm all old public Mux playback/thumbnail URLs are denied. Supabase documents that changing Auth keys does not revoke Storage signed URLs; object deletion/CDN propagation or provider-assisted revocation must be verified. See [Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads) and [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
5. Exercise actual Storage HTTP download/signing denial and gateway retrieval with three real staging accounts, expired JWTs, blocked/removed friends, removed group members and object/post deletion. Check live Realtime WAL does not expose protected columns. The upstream [WAL authorization implementation](https://github.com/supabase/walrus/blob/master/sql/walrus--0.1.sql) filters by column privilege, but the hosted runtime was not exercised here.
6. Verify cleanup cron invocation, retry rows, provider/storage errors and pending queues. Storage deletion retries persist without a fixed retry cap and are ordered by attempt count; Mux's existing worker retains its 20-attempt ceiling and needs monitoring/operator recovery. A missing parent denies new private-media requests before physical deletion. Already downloaded content cannot be retracted from another device.

Do not run the scripts just to “test” against production. They make provider/database changes. This task ran only synthetic/mocked tests.

## Regression evidence and repeatable commands

`tests/privacy/audited-schema.sql` and `audited-storage.sql` are **test fixtures, not deployable migrations**. They contain captured schema/policy/function metadata and synthetic rows only. The harness loads the original notification migrations, applies both new migrations in the corrected run, and executes the same adversarial cases against both versions. It also runs the original `supabase/tests/reliable_live_location.sql` unchanged against the complete corrected schema.

Local tooling used: Node 25.8, PGlite 0.3.14, Deno 2.5.1, installed repository dependencies. Set `SPOTTED_PGLITE_MODULE` to an installed PGlite module if it is outside the repository.

```sh
SPOTTED_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node tests/privacy/authorization.cjs
npm --prefix mobile run test:location
npm --prefix mobile run typecheck
SPOTTED_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node tests/notifications/database.cjs
SPOTTED_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node tests/notifications/coverage.cjs
deno test --no-lock supabase/functions/_shared/private-media.test.ts
deno check --no-lock supabase/functions/*/index.ts scripts/secure-existing-mux.ts scripts/secure-existing-storage.ts
npm run build
# From mobile/: npx expo export --platform ios --output-dir /path/to/output
```

Results: 121 before/after backend assertions pass; original location SQL (29 assertions plus authorization exceptions) passes on the corrected complete schema; 48 native tests pass (37 existing + 11 account/media isolation tests); 45 notification and 35 nightlife/party checks pass. The media gateway/provider/cleanup suite passes 11 tests and covers authorized streaming, unauthorized/no-JWT/copied-URL denial, revocation, expiry, tampering, redirect rejection, token secrecy, RSA key formats, public-ID conversion and deletion retries. Final counts/results are recorded in the external task handoff.

The existing narrow notification fixtures still test their original schema contracts; they do not by themselves prove every production policy. Production-shaped before/after tests supply the additional evidence. No tests were weakened or deleted.

Known gates remain: web Vitest 19 pass / 5 fail; web TypeScript 52 existing diagnostics; root lint 345 errors / 125 warnings; native lint 12 errors / 11 warnings. Native TypeScript and web/Expo iOS bundles pass. No signed Xcode archive, physical-device run, TestFlight upload or live backend/provider test was performed.

## Behavior preserved / deliberate security changes

Preserved: actual recipient friendship acceptance and explicit owner-issued invite-code redemption; current accepted friends/eligible mutuals; trusted server-seeded demos; per-post versus planning versus global location audiences; authorized last-known capture timestamps; explicit party invitation versus address approval; close-friend party-pin rule; exact existing direct chats and group creation/membership/name/photo flow; 5 AM/city boundaries; location quality/dwell/departure/retry/revision rules; push voice, consent, retry/leases, routing and source dedupe from all five Complete Notification Release patches.

Deliberate changes: Home/off/expired status is unavailable to other viewers; raw sensitive columns require the own/safe RPC; active private media must go through authenticated delivery; media updates use immutable new keys; expired/deleted/revoked content fails closed; account switches clear view/query/module state; the old device-global post-audience preference is not inherited by another account (each account starts from the normal default until choosing its own preference); Undo cannot restore the other person's close-list choice. Parked Yap media direct access is disabled rather than rebuilding that UI.

Existing cleanup/recap scheduling and availability limitations are not repaired by the own-image recap allowance. An offline Stop/block cannot change the server until its mutation arrives; the existing general offline action queue/propagation gap remains. Once the server commits Stop, Home, TBD, expiry or revocation, the new read boundary denies precise GPS independently of cleanup. Permission already revoked offline cannot retract content previously downloaded/displayed; refresh/publication gaps remain P2-01.

## Remaining audit findings

- P0-09: anonymous phone/graph enumeration remains overall; some viewer-spoofable helper calls are narrowed but the finding is not closed.
- P0-10: plan children/blocked plan authorization.
- P0-11: parked Yap private replies/anonymous-author APIs (bucket privacy is only partial mitigation).
- P0-12: read-receipt opt-out enforcement.
- P0-13: revoked inbox rows/private plan notifications.
- P0-14: push-log metadata visibility.
- P0-06 remains a rollout gate until legacy objects/public Mux IDs/external URLs are resolved and actual provider/CDN denial is verified. All addressed P0 protections also remain undeployed.
- P1-02 source/schema drift, P1-03 usernames, P1-04 push throughput, P1-06 residual action uniqueness/FKs/manual-write integrity, P1-07 onboarding error/completeness behavior, P1-08 old web party flow, P1-09 failing quality gates, P1-10 release location license/device proof, P1-11 previously committed credentials, P1-12 generic notification integrity remain open. Do not repeat or test the exposed credential values.
- P1-05 early Mux readiness now has persistent ownership state and retry behavior, with a SQL positive regression; provider event ordering/replay and deletion races still require staging verification, so the entire operational finding is not declared closed. P1-01's prior configuration resolution is inherited from the audit; actual delivery remains unverified.

## Physical iPhone / TestFlight acceptance

Use the release configuration and record version, build number, EAS/Xcode build record and Git SHA. A TestFlight version/build label alone does not establish its commit.

1. With owner A, close friend B, normal friend C and actual eligible mutual D: request/recipient acceptance, requester's attempted self-accept, remove/Undo/30-second expiry, block/unblock, stale close selection; refresh feed/map/friend card/DM on both devices. Confirm intended positive audiences and revoked negative audiences.
2. Walk between two real venues foreground, background and locked; keep original 75-second/three-sample arrival, departure, quality/speed/ambiguity and revision behavior. Test offline latest-sample retry, consent/permission loss, manual correction, Out→TBD/Home/Stop, restart, city/time-zone change and the exact 5 AM boundary. Confirm last-known timestamps never become falsely fresh.
3. Private party: close-only exact pin, normal friend neighborhood, invite acceptance without address, explicit approval, block/hide/removal/end/restart/expiry revocation. Restart without coordinates must not retain the old pin. Inspect actual Realtime/API payloads as well as UI.
4. Prime A's feed/cards/comments/DMs/recap/post-detail/native images/video, delay network headers and body, then sign out and sign in as B rapidly and offline. Release A responses afterward. No A content, callbacks, audience preference, background task or native player may populate B. Repeat A→logout→A and token refresh; normal token refresh must not reset navigation.
5. Pre-create A/B/C group, then start A→B direct conversation. Verify exact two members, both directions reuse, C receives no new direct message/push. Existing group messaging/name/photo behavior must still work.
6. Photo, HEIC, video, DM photo, group photo, profile gallery, shared-post thumbnail and own recap: normal retrieval/upload/retry; copy gateway URLs to logged-out browser and unauthorized account; test after block, removal, expiry/deletion. Check native image cache does not revive content across accounts.
7. Mux on physical AVPlayer: HLS master/variant/segment/key requests keep Authorization, audio/seek/replay/range/background/resume, token refresh and network reconnection work, thumbnails/crop remain acceptable. Test before/after public-ID conversion; all old public provider URLs must fail. Proxy throughput, bandwidth and latency require realistic load measurements.
8. Delete post/DM/account/group photo and abandon uploads; verify immediate authorization denial, later Storage/Mux deletion, retry recovery and warm-CDN/old-signed-URL denial. Verify account deletion errors do not falsely finish before the profile/cleanup queue is committed.
9. Rerun physical notification matrix: foreground/background/terminated/cold tap; friend request/accept, Out/TBD/move scopes, party invite/accept/address request/approval, DM, post interactions, exact routing, provider retry/token rotation, muted settings, dedupe and address-free copy. Test only deliberately enabled campaigns and preserve current activation settings.
