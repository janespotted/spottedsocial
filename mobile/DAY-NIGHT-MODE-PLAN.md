# Day Mode, Night Mode and Morning After — implementation plan

What to build is in `DAY-NIGHT-MODE-SPEC.md` (the client brief, the mockup, the 11 screenshots). This file is **how**: the decisions, the data model, the order of work, and the tests. File and line references were checked against the code on Oct 5 2026.


**Status (Oct 5 2026):** phases 1–5 are built on `feat/day-night-mode`. Both migrations (`20261006100000_night_mode_schedule`, `20261006110000_morning_after_recaps`) passed rolled-back dry runs (29 + 29 checks, including a full `nightly_reset()`), but are **not applied yet**. Enforcement stays off after applying.
---

## 0. Decisions to confirm before building

Each one has a default the plan already uses. Changing one changes only the phase named.

| # | Question | Default in this plan | Phase |
|---|---|---|---|
| D1 | Can people **post** during Day Mode? The brief keeps Plans, DMs, Profile and Morning After open, and locks the Newsfeed. | **No.** The Home "Post" FAB is hidden in Day Mode, and posting starts again at opening. Posts are tonight's content and expire at 5 AM anyway. | 2 |
| D2 | Can someone set **TBD / In** before opening, for example "TBD" at noon? | **No.** In/TBD/Out opens with Night Mode, as the brief lists it. The "Are you out tonight?" prompt waits until opening. | 1 |
| D3 | **Videos** in "The pictures". | **Photos only.** A video's Mux asset is deleted with the post at the reset. Keeping videos would mean deferring that deletion until the recap expires, which can be added later. | 3 |
| D4 | How long a recap lasts. | **Until the next 5 AM reset**, so all day plus that night. A user who stays in tonight gets the empty state tomorrow. | 3 |
| D5 | Who appears in **crossed paths**. | Friends with a GPS-confirmed stop at the **same venue** that overlapped by **≥ 10 minutes**. Their stop must have been visible to the viewer under their audience at the time of the reset. **Excluded:** friends who ended the night on **Stop sharing** (`off`), anyone who hid their location from the viewer, anyone blocked, private parties, and anyone who is no longer a friend when the recap is opened. | 3 |
| D6 | **Night Mode Home.** The mockup's code has a different night Home (Who's out, Venue heat); the brief only covers Day Mode. | **Unchanged.** At night Home is the Newsfeed, exactly as today. The Morning After / Newsfeed sub-tabs show only in Day Mode. | 2 |
| D7 | Header pill in Day Mode. | **"☀ Day"** replaces the `StatusPill` and opens the hours sheet. At opening it turns back into the `StatusPill`. | 1 |
| D8 | Testing Day/Night before the real times. | **Tester accounts** (`spotted_private.night_mode_testers`, added by SQL only) get **Auto / Day / Night** in the hours sheet. The server honours it too, so a forced Night at noon really sends a Meet Up and a forced Day at 9 PM really refuses one. Normal users can't skip the schedule. | 1 |

---

## Rollout and testing (agreed Oct 5 2026)

- **All branches share one Supabase project.** Applying the guards as written would block current builds (and TestFlight users) from going Out before 6 PM with no Day Mode screen to explain why.
- So the guards ship **off**: `spotted_private.night_mode_settings.enforced = false`. While off, the server allows everything at any hour. Switch it on when the Day Mode build is released:
  `update spotted_private.night_mode_settings set enforced = true;`
- **Tester accounts:** `insert into spotted_private.night_mode_testers(user_id, note) values ('<uuid>', 'who');`. A tester's override applies even while enforcement is off, so the refusals can be tested now.
- **Recap testing:** `build_my_recap_now()` (Phase 3, testers only) builds the caller's recap from tonight's data on demand, instead of waiting for 5 AM.
- **Real clock:** a Lahore test account (demo mode) follows Lahore time, so 6 PM and 5 AM can be checked live from Lahore.

## 1. The schedule (one rule, two copies)

Night Mode opens on the **night's date** D: the local date of the most recent 5 AM in the profile city. It closes at the next 5 AM reset.

| Night date (ISO weekday) | Opens |
|---|---|
| Mon–Thu (1–4) | 18:00 |
| Fri (5) | 16:00 |
| Sat (6) | 12:00 |
| Sun (7) | 15:00 |

Using the night date means 1 AM Saturday still belongs to Friday night, which is open. 5:00–11:59 Saturday is Day Mode.

**Server** (new migration):

```sql
create function public.night_mode_opens_at(p_city text, p_at timestamptz default now()) returns timestamptz
language sql stable set search_path='' as $$
 select ((x.d + make_interval(hours => case extract(isodow from x.d)::int
   when 5 then 16 when 6 then 12 when 7 then 15 else 18 end)) at time zone x.tz)
 from (select z.tz, ((p_at at time zone z.tz) - interval '5 hours')::date::timestamp d
       from (select case p_city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi'
             else 'America/New_York' end tz) z) x
$$;
create function public.is_night_mode(p_city text, p_at timestamptz default now()) returns boolean
language sql stable set search_path='' as $$ select p_at >= public.night_mode_opens_at(p_city, p_at) $$;
```

The city → zone `case` is the same one used by `night_start_at`, `next_reset_at`, `commit_night_status`, `save_plan` and `enqueue_scheduled_pushes`. Adding a city now means six places instead of five; the "adding a city" list in CLAUDE.md gets updated.

**Client:** `lib/tonight.ts` stays the only place that computes a boundary (CLAUDE.md rule). It gains the following exports, using its existing private `zonedParts` / `zonedToUtc` (DST-safe):

- `NIGHT_MODE_OPENING` (the table above)
- `nightModeOpensAt(now, city)`
- `isNightModeOpen(now, city)`
- `nextModeChangeAt(now, city)`: the opening time if before it, otherwise the next reset

**Unit tests** go in `mobile/tests/night-mode.test.cjs` (same `node --test` runner as `tests/*.test.cjs`). They cover:

- every weekday per city
- 4:59 / 5:00 / opening − 1 min / opening
- the night after a DST change (both directions)
- Lahore (no DST, UTC+5)
- 1 AM Saturday is open

---

## 2. Data model for Morning After

The recap is **generated inside `nightly_reset()` before anything is deleted**. It only stores what the day view needs, and only for the owner.

### Tables (all owner-only SELECT; no client writes; writes come from definer functions)

```
public.night_recaps
  id uuid pk, user_id uuid → profiles on delete cascade, city text,
  night_date date,                  -- D, shown as "SEP 21"
  created_at, expires_at timestamptz,   -- next 5 AM reset after creation (D4)
  unique (user_id, night_date)

public.night_recap_stops
  recap_id → night_recaps cascade, position int,
  venue_id → venues set null, venue_name text, neighborhood text,
  arrived_at timestamptz,            -- checkins.started_at (set by the server on a GPS fix)
  left_at timestamptz null           -- only when reliable (below), else null → ticket hides "Until"

public.night_recap_photos
  id, recap_id → night_recaps cascade, user_id,
  storage_key text,                  -- the post's own key, kept alive (below)
  width, height, thumbhash, taken_at, source text check (source in ('post','library'))

public.night_recap_people
  recap_id → night_recaps cascade, friend_id → profiles cascade,
  venue_id, venue_name, overlap_start, overlap_end
```

### Building it: `spotted_private.build_night_recaps(v_now)`, called as the first statement of `nightly_reset()`

For every non-demo user whose city night has ended since the last run, the night is `[night_start_at(city, v_now) − 1 day, night_start_at(city, v_now))`. The function is idempotent through the `unique (user_id, night_date)` key, and the reset runs five times a day.

1. **Stops** come from `checkins` started in the window, ordered by `started_at`, and only the server-verified ones (§2a).
   - `left_at = ended_at` only when `ended_at` falls **inside** the window. That means a departure or a status change.
   - A check-in still open, or closed by the reset itself, gets `left_at = null`. Its `ended_at` would be the reset time, which isn't when they left.
   - `neighborhood` comes from `venues.neighborhood`.
2. **Photos** come from the user's own `posts` in the window with `media_type='image'` and an `image_url`.
   - Insert `storage_key = spotted_private.storage_key(image_url)` plus size and thumbhash. This copies the key, not the file.
   - The post row is still deleted later in the same reset (step 7). The file survives because of §2b.
3. **People**: for each of the user's stops, find friends' verified check-ins at the same `venue_id` in the same window, overlapping by ≥ 10 minutes. Count an unknown end as `least(coalesce(ended_at, last_updated_at), window end)`. Keep a friend only if all of these hold **now, at the reset**:
   - `spotted_private.location_audience(viewer, friend, friend.location_sharing_level)` (friendship, audience tier, blocks, `location_hidden`)
   - the friend's `night_statuses.status <> 'off'`. The row still holds last night's value, because the reset clears statuses in a later step.
   - not demo

   Private parties never create check-ins (`commit_night_status` only inserts for `out` with no party), so they can't appear. The result is one row per friend (the first overlapping venue), and the copy never claims they met.
4. **No recap row** when a user has no stops and no photos. Day Home then shows the empty card (§4).
5. `nightly_reset()` also **deletes recaps past `expires_at`**. It does this after building the new ones.

### 2a. Check-ins must be trustworthy first

The old table policies still let a client **insert or edit its own `checkins` rows**. The old web app does this at `src/lib/night-status.ts:283` and `src/components/Layout.tsx:309`. A forged stop could be used to learn where friends were.

The plan keeps the web app working instead of revoking those writes:

- Add `checkins.verified boolean not null default false`.
- A `BEFORE INSERT OR UPDATE` trigger handles client roles (`current_user in ('anon','authenticated')`, the same convention as `guard_dm_invite_pointer`):
  - It forces `verified=false` on insert.
  - On update it keeps `venue_id`, `venue_name` and `started_at` unchanged.
  - It only lets `ended_at` move **earlier** and never before `started_at`. The mobile app's `endNightLocally` sets it to now, which is allowed.
- `commit_night_status` and `record_live_location` (definer, server role) set `verified=true` on the rows they insert.
- Recaps read **only `verified` rows**.
- **Backfill:** none. Old rows simply don't count.

### 2b. Keeping recap photos and serving them

- `spotted_private.media_referenced(name)` gains `or exists(select 1 from public.night_recap_photos where storage_key=name)`. Without it, the hourly `private-media-cleanup` deletes the file about an hour after the reset.
- A trigger on `night_recap_photos` **delete** calls the existing `spotted_private.queue_media_delete()`. When a recap expires, the file goes through the normal queue, the same path posts use.
- `spotted_private.private_media_target` gains a branch: the caller may sign a key that is in **their own** unexpired `night_recap_photos`. Nobody else can. The client keeps using `resolvePrivateMedia`, with no new function and no proxy (CLAUDE.md rule).
- Every `spotted_private` migration that ends with the blanket revoke **re-grants `storage_key`** (CLAUDE.md migration-hygiene rule).

### 2c. Reading it: one RPC

`public.get_night_recap()` (definer, `auth.uid()` only) returns the caller's latest unexpired recap as JSON:

- `night_date`
- `stops[]`
- `photos[]` (keys, size, thumbhash)
- `people[]`, joined at read time with `profiles` (display name, avatar). A row is dropped if the two are no longer direct friends or either has blocked the other.

### 2d. Camera-roll additions (explicit only)

`public.add_recap_photo(p_recap uuid, p_key text)` is owner-only, takes an unexpired recap, and accepts a key under `${uid}/recap-v1/`. The client uploads with the existing native `File.upload()` path (`lib/publish-post.ts`) to `post-images`, then calls the RPC.

- Nothing is ever read from the camera roll unless the user picks it in the system picker. `lib/post-media.ts` already has the picker.
- At most 9 photos per recap.

---

## 3. Server guards (Night Mode only)

| What | Where | Rule |
|---|---|---|
| Meet Up | `send_meetup` (latest at `20261005140000:40`), right after the auth check | Fail outside `is_night_mode(sender city)` with "Meet ups open when Night Mode starts at 6 PM." (with the real time) |
| Venue invite | `send_venue_invites` (`20261005140000:12`), same place | Same message, saying "Invites" |
| Out / TBD / Stop sharing | **`BEFORE INSERT OR UPDATE` trigger on `night_statuses`** | When `new.status in ('out','planning','off')` and it differs from the old status, require `is_night_mode(profiles.city)` |

The status guard is a trigger rather than a check inside `commit_night_status`, because `upsert_own_night_status` and direct table writes also reach that table.

- The reset sets `home`, and `home` (In) is allowed any time, so the guard doesn't fire for it.
- Answering a request (`respond_to_invite`) stays open all day, so a card can still be declined in the morning until the reset removes it.

---

## 4. Client: what changes, screen by screen

### 4.1 Mode state

`hooks/use-night-mode.ts` returns `{ mode: 'day'|'night', opensAt, closesAt, city }`. The city comes from `useOwnNightStatus()`, which already sets the active city.

- One timer, set to `nextModeChangeAt`, plus a recheck on AppState `active`.
- On **Day → Night** it invalidates the feed, map, leaderboard and own-status queries.
- **Night → Day** is the existing 5 AM boundary (`handleNightBoundary`).
- `lib/night-mode.ts` holds the demo-only preview override (D8), in the same pattern as `lib/demo-mode.ts`.

### 4.2 Tabs (`app/(tabs)/_layout.tsx`)

- In Day Mode, Leaderboard and Map get `<NativeTabs.Trigger.Badge>☾</NativeTabs.Trigger.Badge>`, with `badgeBackgroundColor` set to the plum `#493551` on `<NativeTabs>`.
- No other tab uses a badge, so the plum colour affects nothing else.
- Changing the badge doesn't remount the tabs; the navigator is keyed only on the visible tab list.
- The icons do **not** change (CLAUDE.md: tab icons track the original set).
- **Fallback:** if `☾` renders poorly in the system badge on device, use an empty badge, which shows as a dot.

### 4.3 Header (`components/header-actions.tsx`)

- `HeaderActions` renders a `ModePill` ("☀ Day", ordinary control) in Day Mode and the `StatusPill` at night. `ModePill` opens a new `/night-hours` form sheet.
- Map imports `StatusPill` directly (`map.tsx:741`), but in Day Mode Map shows the opening screen (§4.4), so nothing more is needed there.

`/night-hours` is a `fitToContents` sheet with no scroll view. It shows:

- "When tonight goes live." with "Opening times are local to {City}."
- the four rows, with today's row highlighted
- one line on what opens
- **Make a plan**

### 4.4 Opening screen: `components/night-opening-screen.tsx`

Props: `kind: 'map'|'leaderboard'|'newsfeed'`, `opensAt`. It shows:

- a "☀ Day Mode" chip
- an icon tile (`map`, `chart.bar.xaxis`, `newspaper`; all verified in `sf-symbols-typescript`)
- the spaced-caps label, headline and line, with copy from SPEC §4
- "Opens today at 6 PM"
- **HH : MM** in lime (tabular), ticking each minute
- "Make a plan while the night takes shape."
- **Make a plan** (`primaryControl`, dark text) → `/create-plan`
- **Message a friend** (lime link) → `/new-chat`

**Map and Leaderboard split into Day and Night components.** The default export picks one, so in Day Mode none of the live hooks mount:

- Map: `useMapData` (30 s polling plus realtime), `useArrivalPrompts`, `MapView`, `getCurrentPosition`.
- Leaderboard: `useLeaderboard` (realtime).

That is what "don't show stale rankings or locations" means here. Leaderboard keeps its header with `HeaderActions`; Map keeps its wordmark/bell/pill row. There is no stale data under the opening screen.

### 4.5 Home (`app/(tabs)/(home)/index.tsx`)

- **Night:** unchanged (D6).
- **Day:** the header (l.204–235) gains the sub-tab row **Morning After | Newsfeed ☾**.
  - It is extracted from the inline Plans | DMs row in `messages.tsx:212–248` into `components/sub-tabs.tsx`. That is now its second use, so per the CLAUDE.md header rule it is extracted rather than duplicated a third time.
  - Default tab: Morning After.
  - **Newsfeed (Day)** shows the opening screen with `kind='newsfeed'`. `useFeed` does not mount, because the Day pane is its own component. That covers the realtime channel, the posts query and the mutual-ids RPC.
  - The **Post FAB** is hidden in Day Mode (D1).
- **Morning After pane** (`components/day-home.tsx`), in the order the brief gives:
  1. `NightCountdownRow`: one row with the moon icon, "Night Mode / Today at 6 PM", and "06h 17m" in lime → `/night-hours`.
  2. `RecapCover`: the scrapbook card (§4.7).
  3. **Tonight's plans**, with "See all →" → `/messages?tab=plans`:
     - one or two `PlanCard`s from the **same `usePlans()` query (`['plans', uid]`)**, filtered to `plan_date` = tonight's night key. Votes, "I'm down" and comments therefore update both places through the shared cache and `usePlansRealtime`.
     - then "+ Share a plan" → `/create-plan`.
     - **Empty:** "What's the plan tonight?" with **Share a plan**. No sample activity.

### 4.6 Chat → Plans (`components/plans-feed.tsx`)

- **Day:**
  - Hide "Around tonight" (it is live activity with Meet up buttons), the TBD banner, the venues-withheld notice, and the status-driven empty states, which say "Update status".
  - The empty state becomes "No plans yet — Share a plan".
- **Both modes:**
  - Split the one plans list into **Tonight** and **Upcoming plans**, by `plan_date` against the night key.
  - Upcoming uses the same `PlanCard` with a date heading (FRI 25). The brief asks for the same cards everywhere, and there is no plan detail route for the mockup's compact row to open.
  - Future plans already outlive the reset (`save_plan` expiry = 5 AM after `plan_date`).

### 4.7 Morning After (rewrite `app/morning-after.tsx` and add two small routes)

- **`RecapCover`** (Home card):
  - "Morning After"
  - a lime "LAST NIGHT" sticker (dark text, rotated 5°)
  - "About / last night…" in Montserrat semibold, about 30 pt
  - two Polaroid frames rotated −10° / +9°. The front one is the first photo (expo-image, `cacheKey` = storage key, `placeholder={{ thumbhash }}`), or a sparkles icon.
  - up to 3 overlapping friend avatars from `people`
  - "▶ Replay the night" in pale lime
  - **No recap:** a quiet card, "Your Morning After shows up here after a night out." No fake content.
- **Replay screen** (`/morning-after`, pushed):
  - "Morning After" with "SEP 21 · ONLY YOU"
  - a chapter bar: 3 pt top bars, lime when active, labels tappable
  - the story panel
  - Back as a round outline button; Next as `primaryControl` with the arrow **inline** (the mockup wraps it)
  - No auto-advance.
- **Chapters are built from what exists.** An empty chapter is left out rather than shown blank:
  - **The stops:** "You made the rounds.", or for one stop "You picked your spot."
    - Tickets: light paper `#F0E6F3`, ink `#281835`, tilted ±2°.
    - "FIRST STOP / NEXT STOP · 9:15 PM", the venue, "Neighbourhood · Until 10:20 PM" (the "Until" only when `left_at` exists), and "↓ one more stop" between tickets.
  - **The pictures:** "Camera roll confidential."
    - A 3-column grid of 4:5 Polaroids with alternating tilt; tap opens `/recap-photo?index=n`, which has a large photo, "Last night · Only you", and Previous / Next.
    - "+ Add from your library" (§2d).
    - With no photos, this chapter still appears if there are stops, but only as "No pictures from last night" plus the add button, because that is the one place to add them.
  - **The people:** "Look who was there."
    - Rows: avatar with a violet ring, the name, "Crossed paths at {venue}", a chevron → `/crossed-paths?friendId=`.
    - That screen shows "YOU CROSSED PATHS / {venue} / Last night · You were there at overlapping times." and "Based on check-ins shared with you."
    - **Say hey** opens the DM (the same thread helper as the friend card's Chat); tapping the avatar opens the friend card.
    - Footnote: "Overlapping check-ins shared with you."
  - **End:** "Same crew, new plan →" → `/create-plan` with every person preselected. `create-plan` gains a `withIds` param; `PlanForm` already accepts `initial.friends`.
- **No recap:** `EmptyState` with "Nothing to replay — Morning After shows the spots you checked into last night." and a **Make a plan** action.
- **New theme tokens** in `lib/theme.ts`: `TICKET_PAPER`, `TICKET_INK`, `PLUM_BADGE`, and the cover gradient as one class string. No hex values in screens.
- The **10 AM local notification** stays as is (`check-in.tsx:167`). Its body becomes "Replay the night — your stops, pictures and familiar faces."

### 4.8 Immediate requests and check-in in Day Mode

**Meet Up and invites:**

- **Friend card:** in Day Mode the action row shows **Make plans** and **Chat**, never Meet Up. After the reset nobody is "out" anyway, but the rule is explicit.
- **Venue card:** "Invite friends here" is replaced by a quiet line, "Invites open at 6 PM".
- **Plans:** "Around tonight" is hidden (§4.6).
- **Home:** the `OutTonightCard` is Night-only already.
- The server guard (§3) is the backstop. Its message is shown in an alert.

**Check-in and the status prompt:**

- `NightStatusGate` never prompts in Day Mode: it treats Day as "answered". At opening, the existing unanswered → prompt behaviour applies.
- **Opening never checks anyone in or starts location.** Background location starts only on an explicit `out` (`background-location-manager.tsx`), and that can't happen in Day Mode (§3).
- **`/check-in` itself** shows a small "Night Mode opens at 6 PM" state in Day Mode. This one guard covers every entry point: the profile rows `profile.tsx:455/470`, push `url:'/check-in'`, the daily nudges, and the rest.

---

## 5. Phases

| Phase | Contents | Ships when |
|---|---|---|
| **1. Schedule and gating** | §1 SQL and client functions plus tests; §3 guards; §4.1 hook and preview; §4.2 badges; §4.3 Day pill and `/night-hours`; §4.4 opening screens and the Map/Leaderboard split; §4.8 | Dry-run SQL tests pass; simulator checks of Day/Night via the preview, and a real transition by setting the simulator clock |
| **2. Day Home and Plans** | §4.5 (sub-tabs, countdown, plans preview, FAB rule) and §4.6 (Tonight / Upcoming, Day trims) | Home preview and Chat → Plans show the same plans and votes |
| **3. Recap backend** | §2 tables, builder in `nightly_reset()`, §2a check-in provenance, §2b media keep, serve and cleanup, §2c read RPC, §2d add-photo RPC | Dry-run suite (§6) passes; then apply |
| **4. Morning After UI** | §4.7 cover, replay, photo viewer, crossed-paths screen, Same crew, library add, notification copy | Real recap from a seeded night on the simulator |
| **5. Docs and QA** | A CLAUDE.md section (rules that must not regress), the "adding a city" list, `database.types.ts`, a full test pass | — |

Each phase is one commit (or more), pushed after it is verified, as before.

---

## 6. Tests

**SQL dry runs.** Same technique as the invite cards: the migration body plus a `DO` block that impersonates users and ends with `raise exception 'DRYRUN'`. They cover:

- `night_mode_opens_at` for each weekday and city, the DST weeks, Lahore, and 1 AM Saturday.
- **Guards:**
  - Meet Up and invite are rejected in the day and allowed at night.
  - `out`/`planning`/`off` are rejected in the day.
  - `home` is allowed any time, and the reset still writes `home`.
- **Check-in provenance:**
  - A client insert is unverified.
  - A client can't move `venue_id`/`started_at`, and can only shorten `ended_at`.
  - RPC inserts are verified.
- **Recap builder:**
  - one stop
  - two stops in order
  - an open check-in → `left_at` null
  - no activity → no recap
  - idempotent across two runs
  - photos copied before the posts are deleted
  - the file is still referenced after the reset
  - expiry deletes the row and queues the file
- **Crossed-paths privacy.** Each case is a friend at the same venue with an overlap:
  - an `all_friends` friend → appears
  - a `close_friends` owner and a non-close viewer → hidden
  - `location_hidden` → hidden
  - blocked → hidden
  - status `off` → hidden
  - a non-friend at the venue → hidden
  - a mutual-only friend with level `mutual_friends` → appears
  - an overlap under 10 minutes → hidden
  - an unverified (forged) check-in → ignored
  - a friendship removed after the reset → dropped at read time
- **RLS:**
  - Another user can't read my recap tables or call `add_recap_photo` on my recap.
  - `private_media_target` signs a recap key for the owner only.

**Client unit tests** (`mobile/tests/*.test.cjs`): the schedule functions, the chapter-building rules (which chapters show), and the tonight/upcoming plan split.

**Simulator.** The checks below use the preview override, then the real clock (`xcrun simctl status_bar` doesn't move the clock, so set the Mac's time zone or test at a boundary in Lahore):

- the Day → Night flip while the app is open
- the 5 AM flip
- every empty state
- that Home plan votes match Chat → Plans

---

## 7. Risks and notes

- **Global reset, per-city nights.** The builder must key on each user's own city window, as the reset already does. Lahore's reset runs at 00:10 UTC, so its recaps are built then.
- **Departure times are often unknown.** Anyone still "out" at 5 AM has `ended_at` set by the reset. The ticket then shows the arrival time only, which the brief allows: "when reliably recorded".
- **Crossed paths uses the friend's settings at the reset, not at the moment of the stop.** If they tightened their audience during the night, the stricter setting wins. If they loosened it, the looser one does. There is no audience history to do better without a new log.
- **The old web app keeps working** (§2a keeps its writes), but its check-ins never become recap stops or crossed paths.
- **`badgeBackgroundColor` applies to all tab badges.** None are used today; if Chat ever gets an unread badge, it would also be plum.
