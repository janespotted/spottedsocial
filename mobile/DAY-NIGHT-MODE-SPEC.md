# Day Mode, Night Mode and Morning After — client spec

Status: **requirements and screenshots captured.** The implementation plan is `DAY-NIGHT-MODE-PLAN.md`. Nothing here is built yet.

Sources:

- Client brief (Oct 5 2026), sections 1–8 below.
- The client's tappable mockup, a ChatGPT/Codex share named "Spotted Morning After Replay". It is not kept in the repo; the screenshots below show it. Only its **Day Mode** variant renders. The Night Mode screens are in its script but are never shown.
- Names, venues, photos and times in the mockup (Sophie, Mia, Alex, Penelope, Gospel, Nowadays, San Vicente, "Mon, Sep 21") are **examples, not production data**.

---

## The idea in one paragraph

The app has two modes each day. **Night Mode** is the live app: map, In / TBD / Out, venue heat, check-ins, meetup requests and venue invites. It opens at a set time per weekday in the city's local time and ends at the 5 AM reset. **Day Mode** runs from 5 AM until Night Mode opens. It keeps the social parts (Plans, DMs, Profile, friends) and adds **Morning After**, a private scrapbook replay of the user's last night. The live sections stay in the tab bar, but in Day Mode they open a branded "opens at…" screen instead of stale data.

---

## 1. Navigation (keep the existing one)

- Bottom tabs stay in this order: **Home, Leaderboard, Map, Chat, Profile**.
- Chat is **Plans | DMs**. Yap is replaced by Plans, and the existing Plans functionality lives there.
- All tabs stay visible and tappable during the day.
- Mockup details:
  - Leaderboard and Map carry a small **moon badge** on the tab icon during Day Mode.
  - The Newsfeed sub-tab label carries a moon icon too.
  - Home's sub-tabs read **Morning After | Newsfeed** in Day Mode.
- Mockup header: "Spotted" wordmark, city pill (NYC), search (opens Friends), bell (opens Notifications), and a **"☀ Day"** pill. The pill opens the Night Mode hours page.

## 2. Day Mode Home

In this order:

1. **Compact Night Mode countdown.** This is one row:
   - left: moon icon, "Night Mode", and the opening time underneath ("Today at 6 PM")
   - right: "06h 18m" in lime with tabular numbers
   - Tapping it opens the hours page.
2. **Morning After card.** The scrapbook-style "About last night…" card with the **"▶ Replay the night"** CTA. Details are in §3.
3. **Tonight's Plans preview.**
   - Show one or two real plans.
   - The heading row is "Tonight's plans", with **See all →** opening Chat → Plans.
   - **"+ Share a plan"** opens the composer.

Rules:

- Keep Home visually light. Don't repeat headings, descriptions or explanations; put extra detail behind taps.
- Home and Plans use **the same plan card and the same data**. An action on one updates the other.
- The card keeps the current design:
  - author avatar and name, with the audience under the name ("Friends")
  - venue at top right in lime, with a map pin and a "…" overflow
  - "Tonight · 9 PM" (calendar and clock icons)
  - "Going with" plus avatars, or "Nobody's joined yet"
  - comment count bottom left, and an up/down vote pill bottom right (the selected arrow is lime)
- With no plans tonight, show **"What's the plan tonight?"** plus **"Share a plan"**. Never show sample activity.

## 3. Morning After — "Replay the night"

### Home card (the cover)

A small scrapbook within Spotted's branding:

- **Top row:** "Morning After" on the left. On the right, a lime **"LAST NIGHT" sticker** (dark text, rotated about 5°).
- **Middle:** a big two-line title, **"About / last night…"** (about 28–32 pt, semibold, tight leading). Beside it, two layered **photo frames** with Polaroid borders (a thicker bottom edge), rotated −10° and +9°. The front frame shows the user's first photo, or an icon when there is none.
- **Bottom row:** overlapping mini avatars of the friends from the night, and "▶ Replay the night" in pale lime.
- **Look:** violet → plum gradient, a lighter violet border, about 22 pt corner radius.

### The replay screen

- **Header row:** "Morning After" on the left; "SEP 21 · ONLY YOU" (the night's date) on the right.
- **Chapter tabs:** three equal tabs, **The stops / The pictures / The people**. Each has a 3 pt top bar, lime on the active one.
- **Navigation:** tap a chapter label, or use **Next →** / **←** (Back). **No auto-advance.**
- **Story panel:** a plum gradient panel, about 20 pt radius, with a minimum height so chapters don't jump.

**Chapter 1: The stops** ("01 / THE STOPS", title **"You made / the rounds."**)

- The user's real venues, in chronological order, styled as **tickets**:
  - light card with dark text, tilted ±2°
  - header row "FIRST STOP · 9:15 PM", then "NEXT STOP · …", over a dashed divider
  - the venue name large, with "Neighbourhood · Until 10:20 PM" under it
- Between tickets: "↓ one more stop".
- Arrival and departure times appear **only when reliably recorded**.

**Chapter 2: The pictures** ("02 / THE PICTURES", title **"Camera roll / confidential."**)

- The user's photos from that night in a scrapbook grid: three columns, 4:5 Polaroid frames, alternating tilt.
- Tapping a photo opens it large with **Previous / Next** controls.
- Caption: "Your night, saved here. Only you."
- The mockup's "Add your pictures" upload is a preview interaction only.
  - In the app, the photos are the user's **actual night photos**.
  - A camera-roll addition must be **explicitly selected by the user**.

**Chapter 3: The people** ("03 / THE PEOPLE", title **"Look who / was there."**)

- Each row shows a friend whose **shared** venue check-ins overlapped with the user's, as an avatar, the name and "Crossed paths at Gospel".
- Tapping a row opens a person page:
  - "YOU CROSSED PATHS", then the venue, then "Last night · You were there at overlapping times."
  - footnote "Based on check-ins shared with you."
  - **Say hey** opens the DM.
- Footnote under the list: "Overlapping check-ins shared with you."

**End:** on the last chapter, Next becomes **"Same crew, new plan →"**, which opens the plan composer.

### Rules

- **The recap is private** to the user.
- **Crossed paths** must:
  - respect the other person's sharing permissions (the audience they had that night)
  - never reveal a hidden location (Stop sharing, a private party, `location_hidden`, blocked)
  - never present a shared venue overlap as proof the two actually met
- **Real data only.**
  - A night with one stop, no photos or no overlaps reads naturally: drop or soften that chapter rather than show an empty template.
  - A user with **no activity** gets a simple empty state, never a fabricated recap.

## 4. Daytime access

Available all day:

- Morning After
- creating, viewing and interacting with future Plans
- regular DMs
- Profile and friends

**Newsfeed, the live Leaderboard and Map** stay visible. In Day Mode, tapping them shows a branded **opening screen**:

- **Layout:** a centred rounded-square icon (map, chart or newspaper), a spaced-caps label ("LIVE MAP", "LEADERBOARD", "NEWSFEED"), a headline, and one muted line.
- **"Opens today at 6 PM"**, then a large lime **HH : MM** countdown with "hours" and "minutes" under it.
- **Make a plan** (lime primary button) and **Message a friend** (link).

Copy from the mockup:

| Section | Headline | Line |
|---|---|---|
| Map | See where the night goes. | Find friends out, shared spots, and venue heat when Night Mode starts. |
| Leaderboard | Where's everyone going? | See which spots are picking up tonight when Night Mode starts. |
| Newsfeed | Catch the night as it happens. | See tonight's posts and activity from your people when Night Mode starts. |

Never show stale venue rankings or locations as live daytime activity.

## 5. Plans versus immediate requests

These stay separate:

| | Meaning | When |
|---|---|---|
| **Plans** | Arrange something for later tonight or a future date | All day |
| **Meetup request** | "Want to meet up?" right now; location ambiguous | Night Mode only |
| **Venue invite** | Join me at this venue right now | Night Mode only |

- Sending meetup requests and venue invites is enabled **only in Night Mode**.
- Regular messaging works all day.
- In the mockup, a Night Mode DM thread has **Meet up** and **Invite to venue** buttons above the messages; Day Mode has neither.
- The cards themselves are the ones already built (`components/invite-card.tsx`).

## 6. Night Mode schedule

In the **selected city's local time** (the profile city, the same rule as the 5 AM reset):

| Day | Opens |
|---|---|
| Monday–Thursday | 6 PM |
| Friday | 4 PM |
| Saturday | 12 PM (noon) |
| Sunday | 3 PM |

The mockup's hours page shows:

- "When tonight goes live." with "Opening times are local to NYC." (the city name)
- the table above
- "When Night Mode starts: Live map, In / TBD / Out, venue heat, and check-ins. Send a meetup request or venue invite when you're ready to meet now."

At opening, these become available under the existing audience and status rules: live Newsfeed, Leaderboard, Map, In/TBD/Out, venue activity, check-ins, meetup requests and venue invites.

**Opening Night Mode must not check anyone in or start sharing their location.** It only unlocks things.

## 7. The 5 AM reset

- Keep stopping live location sharing and clearing nightly content at 5 AM.
- **Future Plans stay** until they happen or are cancelled.
- Morning After needs a **separate private recap generated before the nightly data is cleared**. It preserves only what the day view needs (stops, the user's own photos, crossed-paths results already filtered for privacy). Expired posts and locations must not stay publicly accessible.

## 8. Design and verification

- **Design:**
  - Spotted's plum backgrounds, lime accents and Montserrat, plus the current navigation.
  - Text on dark surfaces stays clearly readable.
  - **Lime buttons get dark text.**
- **Test:**
  - the opening-time transition, both Day → Night at the scheduled time and Night → Day at 5 AM
  - the 5 AM reset
  - empty states
  - privacy filtering
  - that Home's plan preview and Chat → Plans stay consistent

---

## Mockup reference

### Colours (mockup values; map to `lib/theme.ts` tokens during planning, don't copy hex)

| Mockup token | Value | Use |
|---|---|---|
| `--dn-bg` | #1A1229 | screen background |
| `--dn-surface` | #251B37 | cards, plan card |
| `--dn-raised` | #302142 | countdown row, pills, notices |
| `--dn-text` | #F8F5F0 | primary text |
| `--dn-muted` | #C8C0D0 | secondary text |
| `--dn-lime` | #C4F000 | accent, primary button (text #1A1229) |
| `--dn-border` | #493657 | dividers |
| tab bar | #180F25 | bottom nav |
| moon badge | #493551 fill, #EEE2F5 icon, 17 px, 2 px ring | Map / Leaderboard / Newsfeed |
| Night pill | #303C20 bg, lime text | "Night Mode" label |

Other mockup values:

- **Status badges:** Pending #493551 / #DFCEE9, Accepted #354025 / #D5F776, Declined #45303F / #E2C4D3.
- **Radii:** cards 16–22 pt, buttons 25 pt (pills), story panel 20 pt, tickets 8 pt.

### Other screens in the mockup

- **Notifications (Day):** "You're all caught up. / Updates from your friends will appear here."
- **Profile (Day):** the notice "Day Mode · Live location sharing starts when you choose Out in Night Mode."
- **Plan composer:**
  - "Make a plan. / For later tonight or another day."
  - "What do you have in mind?" with the placeholder "Drinks, a party, a maybe…"
  - "When?" with the placeholder "Friday around 8 PM"
  - "Visible to: Friends"
  - Share plan
  - The app keeps its own composer (venue + date/time); this is the mockup's simplified version.
- **Plans page:**
  - a dashed "Share a plan · Post when & where — see who's down" row
  - plan cards
  - "Upcoming plans" with a date block (FRI **25**), the title and "8 PM · Place TBD"
- **Night Mode Home** (in code, not rendered):
  - "The night is live. Find your people. Find your next stop."
  - a status summary row ("You're TBD tonight · Visible to Friends · Until 5 AM", Edit)
  - Who's out, Venue heat with Check in, shortcuts ("1 new invite", "Your friends"), Tonight's plans, "Explore Night Mode"
- **Status sheet (Night):**
  - "Are you out tonight?" with In / TBD / Out segments, each with its own notice
  - Out → "Choose your spot" → check-in ("Sharing stops at 5 AM or when you switch to TBD or In.")

---

## What exists today (checked Oct 5 2026, to inform the plan)

- **Already matches:**
  - The tabs are Home / Leaderboard / Map / Chat / Profile.
  - Chat is already **Plans | DMs**, with Yap parked (see CLAUDE.md, "Plans in the Chat tab").
  - Home is the Newsfeed only.
- **Plans** already support future dates. `expires_at` is 5 AM after `plan_date` in the city zone (`upsert` RPC in `20260924213834_v1_plans_inbox_privacy.sql`), so a future plan survives tonight's reset. Plan cards are `components/plan-card.tsx`, data is `lib/plans.ts`, and the composer is `app/create-plan.tsx`.
- **Morning After** exists as a bare screen, `app/morning-after.tsx`:
  - It lists the user's own `checkins` for last night's window.
  - It is opened by a 10 AM local notification scheduled at check-in (`check-in.tsx`).
  - It is allowed above the night-status gate.
  - `20260426020000_morning_after_rpcs.sql` holds older Yap-based recap RPCs.
- **5 AM reset** (`nightly_reset()`):
  - **Closes** `checkins` (sets `ended_at`) rather than deleting them, so stops survive the reset.
  - **Deletes** posts, DMs, invites, yaps, expired plans and notifications.
  - Photos for the recap therefore have to be captured before the reset (§7).
- **Not built:** a Day/Night Mode concept, the opening schedule, locked tabs, moon badges, the countdown, the replay chapters, crossed paths, and gating Meet Up / venue invites to Night Mode.

## Screenshots

These are the client's screenshots of the mockup (Oct 5 2026), copied to `mobile/design-reference/day-night/`. All of them are Day Mode, 11:42 AM, NYC, with Night Mode opening at 6 PM.

| # | File | Shows |
|---|---|---|
| 1 | `01-home-day.png` | **Home (Day).** Header (wordmark, NYC, search, bell, "☀ Day" pill). Sub-tabs **Morning After** (selected, lime underline) and **Newsfeed ☾**. Compact countdown row ("Night Mode / Today at 6 PM", "06h 17m" in lime). The scrapbook **About last night…** card. **Tonight's plans** with See all →, one plan card, then "+ Share a plan". Tab bar has moon badges on Leaderboard and Map. |
| 2 | `02-newsfeed-day-locked.png` | **Home → Newsfeed (Day).** A "☀ Day Mode" chip, then the opening screen: newspaper icon tile, NEWSFEED, "Catch the night as it happens.", "Opens today at 6 PM", **06 : 17** hours/minutes, "Make a plan while the night takes shape.", **Make a plan** (lime) and **Message a friend** (lime link). |
| 3 | `03-replay-stops.png` | **Replay, chapter 1.** "← Back", "Morning After" with "SEP 21 · ONLY YOU", three chapter tabs with a lime bar on the active one. Two tilted light **tickets** (FIRST STOP 9:15 PM Gospel, "SoHo · Until 10:20 PM"; NEXT STOP 10:45 PM Nowadays) joined by "↓ one more stop". Full-width **Next**. |
| 4 | `04-replay-pictures.png` | **Chapter 2.** "Camera roll confidential." Three Polaroid frames at alternating tilts (placeholders "Photo 01–03"), "+ Add your pictures", and the caption "Preview placeholders…". Back is a round outline button, Next is lime. |
| 5 | `05-replay-people.png` | **Chapter 3.** "Look who was there." Rows: avatar with a violet ring, name, "Crossed paths at Gospel", chevron. Footnote "Overlapping check-ins shared with you." Last button: **Same crew, new plan →**. |
| 6 | `06-photo-viewer.png` | **Photo viewer.** "← Morning After", "Your pictures", a large 4:5 photo, "Last night · Only you", **Previous / Next** outline buttons. |
| 7 | `07-crossed-paths-person.png` | **Crossed-paths person.** "← Morning After", avatar with "Sophie / Friend", a card reading "YOU CROSSED PATHS / Gospel / Last night · You were there at overlapping times.", "Based on check-ins shared with you.", **Say hey** (lime). |
| 8 | `08-leaderboard-day-locked.png` | **Leaderboard (Day).** The same opening screen: chart icon, LEADERBOARD, "Where's everyone going?". |
| 9 | `09-make-a-plan.png` | **Make a plan** (the mockup's simplified composer). "What do you have in mind?" and "When?" as free text, "Visible to: Friends", and a disabled **Share plan**. The app keeps its own composer (venue + date/time picker). |
| 10 | `10-chat-plans.png` | **Chat → Plans.** Plans \| DMs, a "Plans" title, a dashed **Share a plan** row ("Post when & where — see who's down"), two plan cards ("Going with S" and "Nobody's joined yet"), and **Upcoming plans** (a FRI 25 date block, "Friday with the crew", "8 PM · Place TBD"). |
| 11 | `11-map-day-locked.png` | **Map (Day).** The same opening screen: map icon, LIVE MAP, "See where the night goes." |

Notes from the screenshots that the mockup's code doesn't make obvious:

- **The opening screens put a small "☀ Day Mode" chip above the icon tile.** Newsfeed shows it under the sub-tabs; Map and Leaderboard show it right under the header.
- **The mockup's tab bar is a floating rounded bar** with a filled pill behind the selected tab. That is the web mockup's chrome. The app keeps its **native tab bar** (CLAUDE.md, Brand), so only the **moon badges** carry over.
- **The Next and Same crew buttons wrap their arrow onto a second line.** That is a mockup layout bug; keep the arrow inline.
- **The header's "☀ Day" pill sits where the app's `StatusPill` is.** In Day Mode there is no tonight status to set, so the pill turns into the Day/Night indicator and opens the hours page. The plan must confirm this.
