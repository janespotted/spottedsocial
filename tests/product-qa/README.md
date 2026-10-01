# V1 product QA regression checks

These tests are synthetic and local. They never connect to a hosted Supabase project, send pushes, or mutate providers.

Run the native production-callback/query regressions with the existing native runner:

```sh
cd mobile
npm run test:location
npm run typecheck
CI=1 EXPO_NO_TELEMETRY=1 npm run lint
```

From the repository root, using an installed `@electric-sql/pglite` module (or its absolute path in `SPOTTED_PGLITE_MODULE`):

```sh
node tests/product-qa/database.cjs
node tests/product-qa/live-location.cjs
node tests/privacy/authorization.cjs
node tests/privacy/beta.cjs
node tests/notifications/database.cjs
node tests/notifications/coverage.cjs
```

`database.cjs` loads the captured schema/storage fixture and all release/privacy/product migrations. It runs actual SQL as synthetic authenticated and anonymous actors. Cases cover authorized/denied post sharing, protected leaderboard metadata, normalized handle collisions, party recipient eligibility, rollback of partial check-in writes, audience-correct notifications, no-GPS check-in, one open visit, manual hold versus real departure, server revision/expiry/identity, separate Close Friends party pin versus street-address consent, and truthful invite recall.

`live-location.cjs` preserves all 29 assertions and authorization exception checks from `supabase/tests/reliable_live_location.sql`, applies the updated product location function to the original fixture, and reruns them unchanged. It complements the full-schema privacy and product cases; it does not model hosted PostGIS, network concurrency or device GPS hardware.

`mobile/tests/product-qa.test.cjs` runs real production functions, query callbacks and effects extracted/transpiled by `product-test-runtime.cjs`, with controlled transport, clock and state. It includes both failure and legitimate controls. UI call-site assertions supplement these tests; they are not rendered-screen or native gesture tests. Node tests and Deno tests have their own runners; the legacy root Vitest discovery also collects them and reports runner incompatibilities.

Physical-device acceptance remains required for GPS/OS permissions/background scheduling, native gestures/layout, keyboard/accessibility, push delivery and visual privacy transitions. Successful Expo export is not an Xcode archive or TestFlight certification.
