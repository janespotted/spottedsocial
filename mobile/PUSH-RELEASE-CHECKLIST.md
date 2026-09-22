# Notification changes and release checks

## Implemented

- The deployed send-push function accepts both legacy `friend_arrived` and
  canonical `friend_arrived_venue`. Both use the same arrival title. New mobile
  code emits the canonical name and routes either name to the map.
- Permission is distinct from registration: failed token detachment, failed
  profile writes and zero-row saves reject. Foreground/network recovery retries
  registration, with bounded backoff; token rotation also updates registration.
- Registration and logout share a serial queue. Logout blocks new registration,
  drains any running registration, removes this phone's token from the current
  profile, and only then signs out locally. Web subscriptions are preserved.
  Failed cleanup keeps the user signed in and asks them to reconnect and retry.
- Cold-start taps and listener taps use one deduplicated handler. The existing
  nightly gate still runs first. New APNs payloads contain receiver_id so the
  app can discard taps belonging to a different account.
- Confirmed automatic venue arrivals now call the same audience-filtered,
  throttled friend notification helper as manual arrivals. Intermediate fixes,
  departures and ambiguous venues do not create arrival alerts.

## Automated verification

Run `npm run test:location` (currently runs all tests in mobile/tests) and
`npm run typecheck` from mobile/. Push tests cover failures and retries, account
mismatch, token rotation, logout ordering/failure, cold-start deduplication,
nightly gating, recipient filtering, legacy compatibility and APNs payloads.
Provider requests in tests are mocked; no test notifications were sent to users.

## TestFlight gate — two real iPhones

- [ ] Confirm the installed build is this branch, with correct APNs entitlement,
      bundle ID, and valid production Apple credentials on the backend.
- [ ] Allow notifications on phone A; verify its token is saved. Temporarily
      interrupt networking during registration, reconnect, and verify recovery.
- [ ] Phone B sends A a DM, meetup request, venue invite and friend request.
      Test delivery while A is foregrounded, backgrounded and locked.
- [ ] Tap each notification while A is open and fully closed. It should open the
      intended destination once, preserving the opening nightly question.
      DMs still open the messages list, not a specific conversation.
- [ ] Trigger a manual and confirmed automatic arrival. Eligible friends get
      the arrival alert; blocked/hidden recipients do not. Friends already at
      the venue are skipped. Verify duplicate fixes do not create duplicate pushes.
- [ ] Disable notifications in Settings, then re-enable and reopen Spotted.
      Verify registration recovers without repeated permission prompts.
- [ ] Log out while registration is running. Confirm the profile token is
      removed before sign-out and new pushes stop reaching the logged-out phone.
      An alert already handed to Apple before logout may still arrive.
- [ ] Try logout offline: show retry feedback and remain signed in. Reconnect
      and retry; verify successful cleanup. Sign into another account and ensure
      old-account notification taps are ignored.
- [ ] Check Focus mode, sounds and badges with actual device settings. This
      change retains the existing APNs badge value (1), not an unread count.

## Remaining limits

Remote delivery still depends on valid Apple credentials, APNs and notification
permissions. Code tests do not establish physical delivery. Friend-arrival fan-out
and other sends remain client-initiated/best-effort, without a durable server
outbox. Their throttle is session-scoped. The existing schema stores one APNs
token per profile, so this patch does not add multi-device delivery. Existing
background-location and nightly privacy behavior is covered by LOCATION.md.
