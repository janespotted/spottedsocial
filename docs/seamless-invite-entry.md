# Invitation entry with two required nominations

The public download and private membership flows share one phone-bound invitation. Opening or forwarding a link never grants access. The existing launch database and Command Center remain the source of truth.

## Member experience

1. Invitation opens `/join`, with the download destination from Launch settings. Installed builds with the new associated-domain entitlement open Spotted directly. `spotted://join` provides an explicit open-app fallback.
2. Verify the number that received the invitation. Apple sign-in remains supported, but a new Apple account must verify that number before claiming a phone invitation. Existing completed members retain access.
3. Continue the existing concise introduction and profile flow. The native companion change saves unfinished profile details per account and reads saved nomination progress from the server.
4. Nominate **two distinct eligible people**. There is no skip; server completion requires both nominations. They enter the future-wave queue, without immediate access or automatic messages.
5. Enter Spotted. The existing optional contact-discovery step remains separate from mandatory nominations.

Someone without an active invitation can request access from the app using their verified phone. Requests share the existing **Requested invites** tab with website submissions. Repeated requests and the same phone submitted through both channels reuse an existing request. Operators select a wave using the existing capacity and permission checks.

## Outreach

Batch invitation previews now point to the branded `/join` page. The original review fingerprint, recipient exclusions, opt-out checks, idempotent queue and delivery-status handling remain intact. Individual legacy messages retain their working direct installation link.

The app offers an unchecked invitation-text opt-in. Only an explicit choice by the verified recipient is recorded and carried to a matching guest on assignment. A nomination never implies SMS permission. None of these changes sends invitations or selects new guests.

## Deployment and coordination — 2026-10-23

- Production migration: `20261023060223_seamless_invite_entry.sql`, applied and verified.
- Native companion branch: `codex/seamless-invite-native`, based on `codex/command-center-native` (`153404a`). Do not replace that source with the older mobile snapshot on this website branch.
- Preserve all subsequent audit fixes when integrating the native companion. Its associated domains require a native build; a website or JavaScript-only update cannot add the entitlement.
- Production remains at 15 completed members, 68 selected First 100 guests, 20 website requests, and zero invitation messages. The First 100 remains draft; admission is still open (`wave_gate=false`, `require_phone=false`), SMS disabled, download URL unset.
- Do **not** enable invitation-only admission until the compatible native release is ready and existing-account access is verified. Configure the actual TestFlight/App Store destination; an unset or invalid link shows an honest opening-soon state.
- Public App Store submission, invitation sending and the coordinated admission switch are separate release steps. This change does not perform them.

## Validation and limits

- Nine database/transport test groups: actual onboarding migrations, admission, existing accounts, Apple phone requirement, mandatory two nominees, retry/resume, deduplication, private permissions, opt-in, capacity, 100-person queue rehearsal, stale review and uncertain delivery handling.
- Five browser-logic tests: approved installation hosts and existing requested-invite wave selection.
- Native companion: TypeScript and 41 focused tests passed, including OTP recovery/repeated taps, saved drafts, launch staging, introduction/admin preview and telemetry regressions.
- Website TypeScript/build passed. Mobile-width browser check (390 px) showed no horizontal overflow. Existing app bundle size warning is unchanged.
- Public metadata returns only `installUrl`; anonymous callers still have no private-schema usage. Supabase's advisory counts add one intentionally public fixed-search-path SECURITY DEFINER projection under each role category; all other advisory categories/counts are unchanged.
- Real SMS delivery, a fresh-install App Store journey, Apple account linking on a device, and native visual regression remain release checks. Another audit was using the native simulator; this task did not replace its build or fixtures.

Commands:

```sh
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test supabase/tests/seamless-invite-entry.test.mjs supabase/tests/request-wave-outreach.test.mjs
node node_modules/typescript/bin/tsc -p tsconfig.launch-admin.json --noEmit
node node_modules/vitest/vitest.mjs run src/launch-entry/installation.test.ts src/launch-admin/request-wave.test.ts
node node_modules/vite/bin/vite.js build
```
