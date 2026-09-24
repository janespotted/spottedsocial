# Review: `chatgpt/location-notifications-release`

Reviewed 2026-09-24 at `de079fa`, diffed against `feat/ios-native` (`9066d1e`). Nothing is merged or deployed yet.

The branch has five commits and 59 files (+3.8k / −2.0k). It covers nightly location tracking, push registration, queued delivery, source-driven nightlife alerts, private-party notifications and notification copy.

## Verification run

- `npm run typecheck` (tsc --noEmit): clean.
- `npm run test:location` (node --test tests/*.test.cjs): **37/37 pass**.
- The SQL suites (`supabase/tests/reliable_live_location.sql`, `tests/notifications/`) were not re-run here; they need a Postgres instance.

## Verified correct

- **Location privacy invariants hold.** `stopOnTerminate: true` and `startOnBoot: false` are unchanged. "Always" permission is requested only through the explicit automatic-updates opt-in. Tracking stops on logout and for a Private Party, twice over: `background-location-manager.tsx` checks `is_private_party`, and `goOutAtVenue` calls `stopBackgroundLocation()`. Native tracking is bounded by `stopAfterElapsedMinutes` to the night's expiry.
- **Tonight rules hold.** `lib/tonight.ts` is still the only boundary computation, and no `getHours() < 5` has crept in. `use-own-night-status.ts` is still the only reader of the user's own status. `invalidateNightStatusQueries` is called after every status write.
- **Server-side notification creation.** The removed client paths (`dm.ts`, `friends.ts`, `post-tags.ts`, `notifications.ts`, `use-feed.ts`, `thread.tsx`, `share-post.tsx`) are now created by database triggers in the same transaction as the action. `send-push` keeps `post_tag` in `VALID_NOTIFICATION_TYPES`.
- **Tap routing.** Every `routeForNotification` target exists under `mobile/src/app/`.
- **Push registration.** `registerPushToken` now throws on transport failure instead of returning `'denied'`. Both callers on this branch (`push-notification-manager.tsx` and the Settings push row) handle the error. The manager retries with backoff, and also on reconnect and token rotation.
- **SQL hygiene.** Every `SECURITY DEFINER` function sets `search_path = ''`.

## Must check before deploy

### 1. Production foreign keys on `notifications`

The new triggers (`notify_post_liked`, `notify_post_commented`, `notify_dm`, `notify_tag`, `notify_friend_*`, party RPCs) insert notifications **without** the `EXCEPTION WHEN OTHERS` guard that `20260708221000` / `20260708221001` added. The new design is intentional: a failed notification rolls back the action. That is safe only if a notification to or from a demo user can never fail.

In the migration history it can't: `20251202054302` repointed `sender_id` and `receiver_id` from `auth.users` to `profiles`, and demo users have `profiles` rows (created with random UUIDs by `seed-demo-data`). But the July 2026 fix still names "demo users not in auth.users" as the cause, which suggests production may differ from the migrations. Run this first:

```sql
select conname, confrelid::regclass
from pg_constraint
where conrelid = 'public.notifications'::regclass and contype = 'f';
```

Both rows must say `profiles`. If either says `auth.users`, then liking, commenting on, DMing, tagging or friending a demo user fails outright (the action rolls back). In that case, repoint the FK first, or restore the guard.

**Checked on production 2026-09-24: `notifications` has no foreign keys at all**, so these inserts cannot fail on a missing user. This check passes.

## Should fix before TestFlight

Status 2026-09-24: #1 and #2 are fixed in the working tree (uncommitted). #3 is still open.

| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 1 | `src/app/morning-after.tsx:39` | `font-sans-bold` does not exist and silently falls back to the system font. | `font-sans-semibold` |
| 2 | `src/app/party.tsx`, `morning-after.tsx`, `notification-settings.tsx`, `friend-card.tsx:150-151` | Hard-coded colours (`#C4F000`, `#1A1229`, `#F8F5F0`, `#302142`, `#B6ADBF`, `#1a0f2e`) instead of `lib/theme.ts`. `#C4F000` is not `NEON` (`#d4ff00`), so the party link on the friend card is a visibly different lime from the rest of the app. | Import `NEON` / `INK` / `INK_LIGHT` / `MIST` etc. from `@/lib/theme`. |
| 3 | `src/lib/push.ts` `signOutWithPushCleanup` | Logout is refused while offline ("Could not log out") until this phone's push token can be detached. This is deliberate, but it means a user on bad signal cannot log out. | Product decision. Alternative: sign out locally anyway and queue the detach, relying on `clear_stale_push_token` when the next account registers this device. |

## Minor

Status 2026-09-24: the Lahore campaign exclusion, the empty client calls and the out-of-date `CLAUDE.md` line are fixed in the working tree. The Lahore fix is in `20260922205151` itself, since that migration has not been applied anywhere. `tests/background-location.test.cjs` now asserts that the client sends **no** arrival alert.

- **Lahore gets no campaign pushes.** `enqueue_scheduled_pushes()` hard-codes `city in ('nyc','la')` (`20260922205151_reliable_notification_delivery.sql:265`), so a Lahore profile never gets the daily nudge or weekend rally, even in demo mode. That matters for testing from Lahore.
- **Push expiry uses the sender's city.** The `push_outbox` expiry cap (same file, ~l.97–103) uses the *sender's* city for "before the next 5 AM". The nightly reset expires notifications at the *receiver's* city reset. The effect is small (the 2 h cap usually binds first), but it diverges from the convention.
- **Empty client calls.** `notifyFriendArrived` / `notifyFriendsPlanning` (`lib/notifications.ts`) are now empty and still called from `background-location.ts:138` and `check-in.tsx:618,685`. Delete them in a follow-up.
- **Deadline timer is not clamped.** `background-location.ts` `deadlineTimer` doesn't clamp to `2**31-1` the way `night-status-gate.tsx` does. It is unreachable today (expiry is always ≤ 24 h) and noted only for consistency.
- **`CLAUDE.md` is out of date.** The "Tagging friends" section says `lib/post-tags.ts` owns the `post_tag` notification; a database trigger does now. Update it when merging.
- **Docs overstate test coverage.** `NIGHTLIFE-NOTIFICATIONS.md` / `PUSH-RELEASE-CHECKLIST.md` cite the passing test counts, but no suite exercises a trigger with an `is_demo` sender or receiver.

## Deploy order

State of production on 2026-09-24 (project `rwavbyvdytdegntdryll`, read-only checks):

- `20260922173438_reliable_live_location` is **already applied**, and it matches the repo file.
- Production also had three leaderboard migrations applied directly, which were in no branch: `20260922030035_bars_and_clubs_only_leaderboard`, `20260922030430_leaderboard_read_public_aggregates` and `20260922033535_add_editorial_neighborhood_leaderboard_coverage`. They are now in `supabase/migrations/`, written from production's own migration history, so `db push` no longer refuses. They touch no function the pending migrations define.
- `pg_cron`, `pg_net` and `supabase_vault` are installed. APNs, VAPID and Mux secrets are set.
- **Missing:** the Vault secrets `spotted_push_url` and `spotted_push_service_key`. The push cron jobs don't exist yet; the migrations create them.

**Deployed 2026-09-24:** the three migrations, the four edge functions and the regenerated `database.types.ts`. The advisors show no errors; the new warnings are for functions that check `auth.uid()` themselves. `delivery_enabled` and `campaigns_enabled` are both still **false**. Remaining: step 2, then step 4.

Steps:

1. Apply the three pending migrations with `npx supabase db push --linked`. They run in timestamp order; `…213920` renames functions created by `…205151`.
   1. `20260922205151_reliable_notification_delivery.sql`
   2. `20260922213920_nightlife_notification_coverage.sql`
   3. `20260922220927_spotted_notification_voice.sql`
2. Create the Vault secrets `spotted_push_url` (`https://rwavbyvdytdegntdryll.supabase.co`) and `spotted_push_service_key` (the service-role key). `wake_push_worker()` raises an error without them, so the every-minute delivery job fails until they exist.
3. Deploy the edge functions `send-push`, `process-push-queue`, `send-daily-nudge` and `send-weekend-rally`, with JWT verification as set in `supabase/config.toml`.
4. Set `update spotted_private.push_settings set delivery_enabled = true;`. **Leave `campaigns_enabled` false** until two-phone QA passes. (`push_outbox` is new, so there are no old rows to skip.)
5. Confirm the cron jobs run: check `cron.job_run_details` for `spotted-push-delivery`, `spotted-push-campaigns` and `spotted-activity-dedupe-cleanup`.
6. Regenerate the types: `npx supabase gen types typescript --linked --schema public > mobile/src/lib/database.types.ts`.
7. Re-run the database advisors: `npx supabase db advisors --linked`.

## Two-iPhone / TestFlight additions

Follow `PUSH-RELEASE-CHECKLIST.md` and `LOCATION-RELEASE-CHECKLIST.md`, and add:

- A real user DMs, likes, comments on and tags a demo-mode friend. Each action must succeed, and each must alert only real recipients.
- Log out on phone A, then send phone A's old account a notification: nothing must arrive on phone A. Log out on phone A while in airplane mode and check the resulting behaviour is acceptable.
- A friend outside your sharing audience, and a friend who set Stop sharing / No: neither may get a friend-out or arrival alert showing your venue.
- A Private Party host: no background GPS, and no party coordinates in any push payload.
- A cold-start tap on a push while "Are you out tonight?" is unanswered: the tap is deferred and replayed after the user answers.
