# October release audit fixes

Based on `8999c419be8ad9b2813fda2dff5f8cb41a7c9b99` (`feat/day-night-mode`). These changes are prepared locally; neither GitHub nor production has been updated.

## Changes

- Recheck current location consent when reading recap overlaps, including hide, audience narrowing, Close Friend removal, blocking and unfriending. Signal location-consent changes to invalidate already cached private views.
- Consolidate the two historical group-creation RPC signatures into one named-argument endpoint. Require 2–64 distinct, current, non-demo friends; reject self/null members and blocked pairs; normalize blank names; limit names to 100 characters; validate before inserting any group records.
- Maintain plan scores and comment counts with private, non-client-callable trigger functions after child writes pass RLS. Backfill stale counts and enable the child-table Realtime subscriptions the app already uses. Refresh Plans on focus/remount.
- Use foreground native file streaming on iOS Simulator. Physical-device background transfers, progress, cancellation, retry keys and Mux routing are preserved. Morning After uses the same photo uploader.
- Import the supported Expo 57 Contacts legacy API and disambiguate the leaderboard's venue foreign key.
- Correct venue-search scrolling, DM camera keyboard dismissal, plan-comment keyboard clearance, and the party address's first Save tap. Expose form fields and the attachment control to accessibility.
- Place friend menus in the same native sheet as their trigger, with bounded scrolling and reachable menu options.
- Remove sender-prefix punctuation from Activity previews and make engagement rows open their post.
- Require a returned saved row before confirming profile/group edits. Give avatar uploads unique paths so a denied profile update cannot overwrite the existing photo. Persist group photo references before requesting their authorized media links.
- Explain missing posts as unavailable, without asserting they expired at 5am.

## Verification

- Mobile TypeScript check: passed.
- Mobile source-execution suite: **114 passed**, no skipped tests.
- New isolated PostgreSQL suite: **73 passed**, including migration idempotency and all three historical group-RPC signature combinations. Synthetic PGlite only; no hosted database connection.
- Patched JS on the release's existing iOS Simulator binary, version 1.0.0 (50), using `spotted-ai-night-simulation`: library photo upload and saved row confirmed; owner/friend reads allowed and unrelated read denied; Contacts loads sample contacts; NYC ranking loads six test venues; LA returns its legitimate empty result without a join error.
- Native UI checks: venue-list drag dismisses keyboard; DM camera dismisses keyboard; plan comment field stays above keyboard; friend-menu options render inside the card; Like Activity opens the exact post; party Save persists on the first tap with keyboard open; unavailable-post copy is correct.
- A deleted test plan disappears after returning to Plans without pulling to refresh. Profile/group denied and zero-row saves are covered by source-execution tests.
- No new Spotted crash reports during the fix validation.

Earlier failures are retained separately. The initial venue swipe targeted a full-height scroll container whose lower portion was behind the keyboard; the corrected native gesture starts in the visible venue list. The old auth test was updated to mock the session lookup now required by the actual profile loader.

## Deployment and remaining checks

Apply `20261009213458_release_audit_privacy_and_plan_counts.sql` to the test project only after approval, then run hosted privacy/counter/Realtime checks and Supabase advisors. The prior approval covered seven release migrations, not this new fix migration. The isolated test result is not proof of hosted rollout.

The shared recap uploader is repaired, but its complete Morning After flow still needs a repeat on the patched test schema. Physical photo/video capture, APNs, real SMS, background GPS and the real 5am boundary remain device/service checks. Test Mux configuration is still unavailable; the app correctly preserves the draft when video upload cannot start. The simulator transfer fix does not establish physical-device background-transfer success.

This fix pass removed its disposable post and plan and restored the synthetic account's city and party state. Earlier audit cleanup still returns `Invalid or expired requestState` from the Supabase connector. Two prior temporary tester rows remain with Auto overrides, plus the previously reported exact test records; no global Night Mode enforcement was enabled. Stored media deletion follows the existing cleanup queue; queue completion is not asserted here.

## Repeat local checks

```sh
npm --prefix mobile run typecheck
npm --prefix mobile run test:location
SPOTTED_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node tests/privacy/release-audit.cjs
```

PGlite tests use the saved synthetic audit schema, never a production restore. See `tests/privacy/README.md` for fixture limitations.
