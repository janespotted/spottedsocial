# Location architecture

Location follows the user's explicit Out session until the profile city's 5am
reset. It never starts sharing for TBD, No, Stop sharing, or a private party.

## Native lifecycle and permissions

`location-ready.ts` owns the single-flight `BackgroundGeolocation.ready()` and
configuration. First access asks When In Use only. The check-in payoff explains
and offers Automatic updates, which requests Always and Motion & Fitness.
Previously accepted automatic updates are remembered. Each new check-in stores
`night_statuses.automatic_venue_updates`; old rows default to false. Enabling the
feature after check-in explicitly updates that flag.

Motion-based GPS uses a 25m distance filter (SDK speed elasticity retained),
pauses after five minutes still, and wakes on confident walking activity as well
as the SDK's motion/geofence events. This avoids relying only on iOS's roughly
200m stationary-geofence exit for a short walk between bars. Native lifecycle
behavior must be verified on real devices; the OS may delay events.

When an accepted fix needs arrival/departure confirmation, a bounded native
watch collects fixes about every 10s for at most two minutes. It is removed on
confirmation, timeout, stop, permission loss, status change, or expiry. A timeout
has a one-minute backoff. This is deliberately not an all-night continuous watch.
The SDK docs allow an iOS watch to run in the background but warn about battery
usage; the bounded lifetime is essential. The app also obtains an accurate fix
on foreground/reconnect and every minute while foregrounded. It never substitutes
an app-alive timestamp for an actual GPS reading.

`stopOnTerminate: true` and `startOnBoot: false` remain. Force quit or power-off
stops new updates. A server-checked expiry rejects all writes after the night;
`stopAfterElapsedMinutes` and an active JS deadline stop native collection.
A powered-off phone cannot deliver new GPS. A locked phone with Always permission
can continue delivering motion updates.

## Atomic server update

Migration `20260922173438_reliable_live_location.sql` installs
`record_live_location`, a SECURITY INVOKER RPC restricted to authenticated users.
It derives the user from `auth.uid()` and locks their night-status row before
checking status, party mode, expiry and `updated_at`. That timestamp is the
explicit user status revision; automatic location/venue writes preserve it.
Delayed samples from an earlier manual check-in cannot overwrite a newer choice.
All profile, status, check-in and candidate changes commit together.

`live_location_state` holds one owner-only RLS row with candidate/dwell state.
There is no location-history table. Explicit status edits and nightly reset clear
it. SDK SQLite persistence is disabled; the app keeps at most the latest pending
sample in AsyncStorage, keyed by user and revision. Reconnect retries preserve
its original capture time. Samples older than two minutes are discarded.

| Rule | Value |
| --- | --- |
| Map GPS accuracy | At most 65m uncertainty |
| Sample age / future tolerance | At most 2 minutes old / 15 seconds future |
| Duplicate / out-of-order sample | Ignored |
| Implausible movement | Reject short-interval jumps above 90m/s, with 200m noise floor |
| Arrival accuracy | At most 35m uncertainty |
| New venue radius | Within 80m |
| Nearest-vs-next venue margin | At least max(25m, reported uncertainty) |
| Arrival dwell | At least 75s across 3+ distinct fixes; gap at most 60s |
| Speed for arrival | At most 2.5m/s when available |
| Preserve nearby manual venue | Do not replace while within max(60m, 2× uncertainty) |
| Departure | More than 150m + uncertainty from current spot across 30s |
| Check-in presence refresh | Accurate fix within 120m of the current venue |

Arrival searches only real bar/club/lounge/rooftop/members-club types in the
profile city. Restaurants/stadiums are excluded. Ambiguous adjacent venues keep
the last confirmed venue or Out; the user can choose the venue in the check-in
sheet. GPS cannot reliably distinguish every neighboring room or floor.

Confirmed departure closes the old check-in and clears its venue label; the map
keeps showing accepted GPS while between spots. Confirmed arrival, with automatic
updates enabled, opens exactly one new check-in and changes the status venue in
the same transaction. A background notification says where the spot changed and
links to the existing correction sheet. Notification denial does not block GPS.
Confirmed automatic arrivals also call the existing privacy-filtered friend
arrival notifier, capped at 20 recipients and once per sender/recipient/venue
per 30 minutes within an app session. Departures and uncertain fixes do not.
This fan-out is best effort, not a durable background delivery queue.

## Stop and privacy

Status changes synchronously cancel the local tracking generation, stop the SDK,
remove arrival watches, drain any in-flight upload, and clear the pending sample.
An explicit stop also persists a local pause latch: an offline server still saying
Out cannot silently restart GPS. Only a successful user-confirmed venue check-in
clears that latch. Writes are bounded by a 15s request timeout.
If the status write itself fails while offline, the user must retry it after
reconnecting to remove the last saved pin from other devices. The local latch
prevents further GPS uploads meanwhile; it does not queue status mutations.

Other people's coordinates still come ONLY from `get_profiles_safe` and private
party coordinates from `party_locations`. Existing audiences, blocked/hidden
users, party RLS, force-quit behavior, and city-time-zone expiry are preserved.
Private party coordinates are not inserted into audience-readable checkins.
Manual check-ins with no usable GPS clear old profile coordinates instead of
re-stamping an old spot; the first accepted fix supplies the live pin.

## Map and labels

Friends require an unexpired Out status. Their last known pin stays through that
session instead of disappearing after 60 minutes. After 15 minutes it fades,
stops pulsing, says Last known, and does not cluster with live people. The friend
card gives the actual update age. A 30s UI clock advances age even when data is
unchanged. Stop sharing and the 5am expiry remove the pin.

Self and friend markers use the same profile coordinates/timestamps. Clusters
require physical proximity: 5m, or the same venue ID and within 60m. Venue names
alone never group people. Venue heat counts require a recent sample. Realtime
updates refresh the map, with a 30s foreground polling fallback. Own updates are
included in the subscription. Cross-user raw profile GPS remains inaccessible.

## Verification and release

Run `npm run test:location` and `npm run typecheck` from `mobile/`.
Run `supabase/tests/reliable_live_location.sql` after applying the migration.
It wraps itself in a rolled-back transaction, inserts synthetic fixtures only, runs
as authenticated with RLS, and covers travel, departure, consent, stale/poor GPS,
duplicates, session conflicts, ambiguity, observation gaps, parties and expiry.

Before shipping, complete `LOCATION-RELEASE-CHECKLIST.md` on two real iPhones.
A Linux code test cannot certify iOS background delivery, battery use, or the
currently installed TestFlight binary. The existing iOS SDK license is a trial
through October 7, 2026; replace it with a valid production key before expiry.
