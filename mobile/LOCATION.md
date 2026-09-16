# Location Architecture

Location is the most critical feature of Spotted — the map, leaderboard, check-ins,
arrival nudges, and friend visibility all run on it. It is also the most
privacy-sensitive surface in the app. Read this before touching anything that
imports `react-native-background-geolocation`.

## The ready-once contract

The Transistorsoft SDK must be configured with `BackgroundGeolocation.ready()`
**exactly once per app launch, before any other SDK call**.

- [`src/lib/location-ready.ts`](src/lib/location-ready.ts) is the **single owner**
  of `.ready()`. It exposes `ensureLocationReady()` — a single-flight promise, so
  concurrent callers share one in-flight configuration and `.ready()` can never
  run twice. A failed `.ready()` resets the promise so the next call retries.
- **Every** function that asks the SDK for a position awaits
  `ensureLocationReady()` first:
  - `getAccurateLocation()` in `location-service.ts` (check-in venue detection,
    neighborhood detection)
  - `getCurrentPosition()` in `background-location.ts` (arrival prompts)
  - `startBackgroundLocation()` in `background-location.ts` (tracking)
- Never call `BackgroundGeolocation.ready()`, or pass config to the plugin,
  anywhere else. Never call `getCurrentPosition`/`start` directly from feature
  code — go through the wrappers above.
- `location-ready.ts` also owns the single permanent `onLocation` dispatcher
  (registered alongside `.ready()`), because one-shot fixes emit `location`
  events too — with no listener the SDK logs "Sending `location` with no
  listeners registered". `background-location.ts` plugs the actual fix
  pipeline in via `setLocationHandler()`; the handler is fully guarded
  (no signed-in user or not "out" → no-op).

## Permission staging (client feedback §3)

Permissions are asked in two explained steps, never as a side effect:

1. **When In Use** — asked once, after an in-app explanation: the onboarding
   "Share Your Location" slide, or the check-in sheet's "Find your spot" step
   when the user taps **Yes** with permission not yet determined. `ready()` is
   configured with `locationAuthorizationRequest: 'WhenInUse'` and
   `disableMotionActivityUpdates: true`, so this first prompt is only the
   standard location dialog — no Motion & Fitness, no background upgrade.
2. **Automatic updates** (Always + Motion & Fitness) — offered on the payoff
   screen **after a venue check-in has already succeeded**, as its own card
   with its own outcome copy. `requestAutomaticUpdates()` upgrades the config
   and prompts; the grant is remembered (`spotted.automatic-updates`) so later
   launches configure Always from the start. Never offered for private parties.

Rules that follow from this:

- Only the check-in **Yes** path may trigger a permission prompt.
  `getCurrentPosition()` (arrival prompts, party fallback) and
  `startBackgroundLocation()` (launch resume, post-check-in) check
  `getLocationPermission()` first and return without prompting.
- A check-in's success and the watcher's availability are separate results:
  `goOutAtVenue` resolves first; `startBackgroundLocation` returns
  `{ tracking, permission }` and the sheet describes it. A watcher failure can
  never surface as "Could not check in".
- Denied: the sheet explains what still works and leads with **Pick a venue**;
  **Open Settings** is secondary. An `AppState` listener re-checks permission
  when the app returns to the foreground and continues automatically.
- The SDK's own "location disabled" alert is off
  (`disableLocationAuthorizationAlert: true`); the sheet owns that UI.

## Who uses location, and how

| Consumer | File | GPS use | Writes |
|---|---|---|---|
| Check-in flow (Yes) | `app/check-in.tsx` → `location-service.ts` | One-shot, 3-sample fix, accuracy-gated (150m; 200m demo/retry) → nearby venues via `find_nearby_venues` RPC. The only path that may prompt. | `night_statuses` (lat/lng via `goOutAtVenue`), `checkins`, `profiles.is_out` + coords |
| Private party neighborhood | `app/check-in.tsx` → `neighborhoodFromCoords` | Reuses the Yes fix; no new GPS call | none (neighborhood string only); exact spot → `party_locations` via DB trigger |
| TBD | `app/check-in.tsx` | **none** — never touches location | `night_statuses` planning fields |
| Arrival prompts (foreground) | `hooks/use-arrival-prompts.ts` | One-shot fix on map open / every 2 min → `find_nearest_venue` (200m) | none until user accepts |
| Background tracking | `lib/background-location.ts` | Continuous while **out** (100m distance filter, stop after 5 min stationary) | `profiles.last_known_lat/lng/last_location_at`, `checkins.last_updated_at` |
| Auto-venue-tracker engine | `lib/venue-arrival-engine.ts` | Consumes background fixes (no GPS calls of its own) | none — emits a local notification deep-linking to `/check-in` |
| Map friend pins | `hooks/use-map-data.ts` | none — **never reads raw GPS of others** | reads `get_profiles_safe` only |

## Privacy invariants (SOW §4) — do not break these

1. **Server-side masking**: other users' coordinates are ONLY read through the
   `get_profiles_safe()` RPC, which masks per-viewer based on
   `location_sharing_level`, friendship, and `location_hidden`. Never select
   `last_known_lat/lng` from `profiles` for anyone but the signed-in user.
2. **Status gate**: background fixes are written only while the user is `out`
   **at a venue** with an unexpired `night_statuses` row. The watcher
   self-stops otherwise (`shouldTrackLiveLocation`, fail-closed, 60s cache) —
   including at a private party, whose exact spot is close-friends-only.
3. **`stopOnTerminate: true`** — force-quitting the app stops tracking; a pin
   must never follow a user after they kill the app.
4. **`startOnBoot: false`** — tracking never resurrects on device reboot.
5. **Stop sharing clears everything**: `stopSharing()` stops the watcher, nulls
   `profiles` GPS, ends open `checkins`, and writes `status='off'` (still
   "answered tonight", invisible to friends). `stayIn()` does the same with
   `home` ("No").
6. **`party_address` is never in an upsert payload** — only set via a separate
   constant UPDATE (WP6). A private party's exact spot lives in
   `party_locations` (RLS: self or close friend); DB triggers strip it from
   `night_statuses` and from `profiles` for every writer. Close friends get
   the pin; everyone else only the neighborhood.
7. **Freshness**: pins render only for locations from *tonight* (5 AM in the
   profile city's zone, `lib/tonight.ts`) and less than 2 hours old
   (`isFreshLocation`). Markers dim at 15 min, drop at 60 min. The nightly
   reset (pg_cron `nightly_reset()` at 10:10 and 13:10 UTC) and
   `endNightLocally()` on next open clear anything that outlives its night.
8. **Audience**: the check-in picker writes `profiles.location_sharing_level`
   (`close_friends` / `all_friends` / `mutual_friends`) — it is THE sharing
   control. Push fan-out re-checks visibility via `get_visible_recipients`.

## Accuracy thresholds

| Threshold | Value | Where |
|---|---|---|
| Check-in venue detection | ≤150m (retry relaxes to 200m; demo 200m) | `location-service.ts` |
| One-shot desired accuracy | 40m | `getCurrentPosition`, `getAccurateLocation` |
| Arrival-engine hard gate | ≤35m | `venue-arrival-engine.ts` |
| Engine trigger radius | ≤200m to venue (reject >500m) | `venue-arrival-engine.ts` |
| Engine dwell | 45s at the same venue across fixes | `venue-arrival-engine.ts` |
| Engine cooldowns | 15 min dismiss/toast; re-entry 20 min + 300m | `venue-arrival-engine.ts` |
| Manual check-in cooldown | 30 min engine silence after any `goOutAtVenue` (persisted; protects manual venue corrections from GPS re-nudges) | `venue-arrival-engine.ts` |

## Licensing

The Transistorsoft SDK runs on a **30-day iOS trial license that expires
Oct 7 2026** (`app.json` → `TSLocationManagerLicense`). Release builds need the
paid key (~$399) before launch; Android will need its own key via the plugin's
`license` prop. Debug/simulator builds work unlicensed.
