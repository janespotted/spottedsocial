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

## Who uses location, and how

| Consumer | File | GPS use | Writes |
|---|---|---|---|
| Check-in flow ("I'm Out") | `app/check-in.tsx` → `location-service.ts` | One-shot, 3-sample fix, accuracy-gated (150m; 200m demo/retry) → nearby venues via `find_nearby_venues` RPC | `night_statuses` (lat/lng via `goOutAtVenue`), `checkins` |
| Planning neighborhood detect | `app/check-in.tsx` → `detectNeighborhoodFromGPS` | One-shot fix → Mapbox reverse geocode → curated neighborhood list | none (neighborhood string only) |
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
   with an unexpired `night_statuses` row. The watcher self-stops otherwise
   (`isUserCurrentlyOut`, fail-closed, 60s cache).
3. **`stopOnTerminate: true`** — force-quitting the app stops tracking; a pin
   must never follow a user after they kill the app.
4. **`startOnBoot: false`** — tracking never resurrects on device reboot.
5. **Stop sharing clears everything**: `stopSharing()` stops the watcher, nulls
   `profiles` GPS, ends open `checkins`, and resets `night_statuses`.
6. **`party_address` is never in an upsert payload** — only set via a separate
   constant UPDATE (WP6). Private parties share exact GPS with close/direct
   friends only; mutuals get no map pin.
7. **Freshness**: pins render only for locations from *tonight* (5am rollover)
   and less than 2 hours old (`isFreshLocation`). Markers dim at 15 min, drop
   at 60 min.
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

## Licensing

The Transistorsoft SDK runs on a **30-day iOS trial license that expires
Oct 7 2026** (`app.json` → `TSLocationManagerLicense`). Release builds need the
paid key (~$399) before launch; Android will need its own key via the plugin's
`license` prop. Debug/simulator builds work unlicensed.
