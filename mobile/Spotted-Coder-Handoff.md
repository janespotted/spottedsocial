# Spotted testing and fixes developer handoff

Jane requested a simulated night out with 500 people interacting through Spotted’s map, friendship groups, invitations, meetups and messages. We created 500 synthetic accounts on a separate Supabase test backend, exercised those interactions, identified backend bottlenecks, implemented fixes and checked the results. The production backend and live app have not been changed.

The code is committed on a new **local** branch. It has not been published to GitHub because the connected integration rejects writes with HTTP 403. Please import the supplied branch bundle, review the changes and publish the branch using an account with repository write access.

## Code and environment

| Item | Value |
| --- | --- |
| Repository | [janespotted/spottedsocial](https://github.com/janespotted/spottedsocial) |
| Source branch | `feat/ios-native` |
| Source commit | `707d0f31c2d039e2947391871e90efdccf9daf07` |
| New local branch | `codex/fix-night-simulation-timeouts` |
| Fix commit | `de54df8691c64215910ee2699e8c3768ccc6687e` |
| Committed changes | 33 files; working tree clean when exported |
| Test backend | `https://mdwmkpefuvcozoqprvvo.supabase.co` |
| Test backend name | `spotted-ai-night-simulation` |
| Production deployment | Pending; production remains unchanged |

The staging schema was restored from current source-project metadata without copying production users or data. Test actors use their own ordinary authenticated sessions. Push delivery is disabled, and the temporary account-provisioning helper is closed. No admin key was downloaded locally. Private environment files, passwords and session tokens are excluded from the deliverables.

## Confirmed problems and fixes

All three migrations below are applied and verified on the isolated test backend. They are in the repository’s `supabase/migrations` directory.

| Migration | Problem and resulting change |
| --- | --- |
| `20261001204257_optimize_social_authorization.sql` | Map and mutual-friend lookups repeatedly scanned the social graph. Adds accepted-friend and canonical block-pair indexes, uses indexed relationship lookups and batches the viewer’s graph calculation for safe profile and mutual-friend reads. |
| `20261001213344_optimize_activity_recipients.sql` | Initial Out commits with the mutual-friends audience still timed out while calculating activity-notification recipients. Calculates the owner’s direct and two-hop recipient sets once. The remaining notification loop is unchanged, including deduplication, delivery caps, cooldowns, preferences and content. |
| `20261001222350_index_dm_thread_membership_lookups.sql` | Authenticated message reads scanned thread memberships repeatedly. Adds nonunique `(user_id, thread_id)` and `(thread_id, user_id)` indexes to `dm_thread_members`, with checks that their definitions, validity and readiness match expectations. |

The authorization changes preserve caller binding, block and hide rules, directional Close Friends, demo exclusions, GPS masking and freshness, private-party handling, function ownership and permissions. The messaging migration changes no RLS, policies, helper functions or grants. Normal authenticated statement timeouts were not increased.

The first two migrations contain reviewed-base function-definition guards. Apply each complete migration transactionally. If a target function has changed, review that difference before deployment; do not remove the guards to force it through. Review index creation against the size and workload of the eventual production database before scheduling deployment.

## What the hosted tests showed

The same saved 500-account scenario was replayed after the two timeout fixes, using bounded action concurrency **20**.

| Planned action outcome | Original run | Replay after timeout fixes |
| --- | ---: | ---: |
| Passed | 3,636 | 7,696 |
| Failed | 1,291 | 0 |
| Skipped | 2,769 | 0 |
| Additional recipient checks passed | 1,090 | 1,903 |

The final replay recorded 9,599 passing events in total and 27,962 passing redacted action-stage requests, with zero retries. All 500 actors completed their assigned backend actions. Coverage included:

- 3,688 map checks, including 1,601 visible results matching controlled coordinates and capture timestamps.
- 583 venue invitations and 500 meetup requests.
- 820 acceptance sequences verifying the exact two-person conversation membership from both accounts.
- 820 unique coordination messages, readable at both ends, across 539 threads.
- 1,903 unique recipient-notification observations. These verify database visibility, not APNs delivery.

Separate regression checks passed: 212 authorization checks with 31,892 before/after result rows, 96 notification-recipient checks, 480 notification-effect checks and four Close Friends-only grant/revoke/restore checks. Regression fixture changes were rolled back.

The third messaging-index migration was applied **after** this full replay. Its separate verification kept all 20 sampled authenticated viewers’ visible message/member counts and payload digests identical; a nonmember remained unable to read the selected conversation. The same profiled exact-message query improved from 110.491 ms and 73,697 buffer hits to 0.385 ms and 22 hits.

A subsequent targeted check passed all 20 new messages in one existing two-person thread, including intended-peer reads and nonmember denial. POST median/p95 was 598/645 ms and peer-read median/p95 was 121/253 ms. This was a three-account targeted API check, not another 500-account replay or a native UI benchmark.

## Test kit and coverage improvements

The commit also includes the isolated simulation kit, native test worker, controlled development-only synthetic login support and UI test hooks. Synthetic login requires a development build, an explicit flag, the exact isolated backend and a synthetic email pattern.

Request diagnostics now follow the adapter owning reused actor sessions, so successful requests are captured as well as failed requests. Logs omit credentials, headers, queries and request/response bodies.

The original privacy scenario selected group owners in a way that mostly exercised broader audiences. Of its 83 Close Friend removals, 82 correctly retained visibility under broader audiences and only one tested effective revocation. It also had no map read after Close Friend add-back. The separate four-step backend regression verified that grant, revocation masking and restoration work.

Future plans now choose a Close Friends-only owner and the actual directional Close Friend in every group. They test effective revocation and restoration in all 83 groups. The expanded plan proposes **7,779 actions** and has passed local scenario checks, but has **not** been executed against staging. The original saved scenario, account bindings and replay evidence remain unchanged.

Local checks passed: 43 backend runner tests, 12 native-worker tests, 97 mobile tests, TypeScript checks, whitespace checks and reconstruction of the delivered patch across all 33 changed files. Native-worker tests used mocks.

## What still needs real iOS testing

This work exercised 500 synthetic accounts through backend requests. It did not operate 500 simultaneous iOS simulators, render map pins, test 500 Realtime subscriptions, use hardware GPS or verify APNs delivery. Actual native UI events and screen recordings are both **zero**. Real phone signup/onboarding, background behavior, network recovery, timed arrival/staleness and the 5 AM boundary remain untested.

The 500 feedback reports are explicitly labeled **AI simulated feedback**. One AI reviewer wrote evidence-grounded templates for assigned scripted personas. They are not 500 independent AI opinions or human usability reviews.

Follow the included `MAC-UI-RUN.md` on a Mac to build the staging app, execute the native login/map/invitation/message flows, capture screenshots and record actual tester sessions. Native privacy revocation/restoration and reconnect checks are priorities. Reciprocal meetup races and interrupted acceptance are additional test hypotheses, not confirmed defects from this run.

## Files to obtain from Jane

- `spotted-night-fixes-branch.bundle`: verified Git bundle containing the new branch and fix commit; requires the source commit above to be available locally.
- `spotted-night-simulation.zip`: code patch, all three migrations, test kit, Mac guide, original and repaired run evidence, verification results and 500 updated simulated feedback reports.
- `spotted-night-fixes-branch.json`: branch and bundle provenance.

These are local deliverables, not public download links. If only this Markdown handoff was forwarded, please obtain the branch bundle and test ZIP from Jane.

The exported branch bundle SHA256 is `83bbd572e4f4e504865901f66c1f65909181af8ce573a8d2bb02211126bab15f`.

## Import and publish the branch

With the source commit available in your repository and the supplied bundle placed in its root, use:

```sh
git bundle verify ./spotted-night-fixes-branch.bundle
git fetch ./spotted-night-fixes-branch.bundle refs/heads/codex/fix-night-simulation-timeouts
git switch -c codex/fix-night-simulation-timeouts FETCH_HEAD
git log -1 --oneline
git diff --stat 707d0f31c2d039e2947391871e90efdccf9daf07 HEAD
git push -u origin codex/fix-night-simulation-timeouts
```

Run this from a clean checkout. If that branch already exists locally, inspect it rather than replacing it. The expected imported commit is `de54df8691c64215910ee2699e8c3768ccc6687e`. Open a draft PR targeting `feat/ios-native` for review.

Review the migrations against the current target, complete native iOS testing on the isolated backend and agree the production release separately with Jane. Importing or publishing the source branch does not deploy the database changes to production.
