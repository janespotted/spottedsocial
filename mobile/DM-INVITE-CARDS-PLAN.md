> **Status (Oct 5 2026): built, for venue invites AND Meet Up requests** (client: "this is for meetup; when you accept in Activity it should show up here and vice versa"). Migration `supabase/migrations/20261005120000_dm_invite_cards.sql`. The table shipped as `public.invites` with `kind` = `venue` | `meetup`. The RPCs are `send_venue_invites` / `send_meetup` / `respond_to_invite` / `withdraw_invites` / `cancel_meetup`. One change from §2.3: an answer **no longer deletes** the request notification. It records the answer in `data.status`, so Activity shows it as the card's pill. The answers chosen for §6 are at the end. CLAUDE.md ("Venue invites and Meet Ups are cards in the DM") is the short contract; where this plan and the code differ, the code and CLAUDE.md are current.

Client request (mockups, Oct 5 2026): a venue invite shows up **inside the 1:1 DM thread** as a card, not only as an Activity row. There are six states, three per side:

| # | Side | Header line | Title | Venue line | Footer |
|---|------|-------------|-------|------------|--------|
| 1 | Sent | ✈︎ "You sent an invite request" | "Invitation sent to Sophie" | 📍 "at San Vicente" | `Pending` pill (clock) |
| 2 | Received | 💬 "Jane sent you an invite request" | "Jane invited you" | 📍 "to San Vicente" | **Accept** (lime) / **Decline** (outline) |
| 3 | Sent | same as 1 | same as 1 | same as 1 | `Accepted` pill (check, lime on dark lime) |
| 4 | Received | same as 2 | same as 2 | same as 2 | `Accepted` pill, buttons gone |
| 5 | Sent | same as 1 | same as 1 | same as 1 | `Declined` pill (xmark, muted red) |
| 6 | Received | same as 2 | same as 2 | same as 2 | `Declined` pill, buttons gone |

Every card shows its send time bottom-right ("10:22 PM"). Sent cards sit on the right and received cards on the left. Above the messages is a "Tonight" divider, and under the header is the existing "Tonight only · messages clear at 5 AM." strip.

---

## 1. What exists today (the gap)

- `lib/venue-invites.ts → sendVenueInvites()` calls `create_notifications_batch` with `type: 'venue_invite'` and the message `"Jane invited you to San Vicente. Want to go?"`, then calls `send-push` once per recipient. **Nothing is written to the DM thread.**
- The invite has **no stored status**. Accepting (`lib/meet-up.ts → acceptVenueInvite`) inserts a `venue_invite_accepted` notification, deletes the request row and opens a DM. **Decline does not exist anywhere.** After the request row is deleted, nothing records that an invite was ever sent, so the sender can never see "Accepted" or "Declined" against it.
- The venue is stored **only as text inside the message** (`acceptVenueInvite` regex-parses the name back out). There is no `venue_id`.
- `app/thread.tsx` knows two message kinds: plain text/photo, and `[shared_post:<id>]` cards that are resolved by a side query. The shared-post pattern is the model to copy for invite cards.
- `notify_dm()` (migration `20260922205151`) creates a `dm` notification and push for every `dm_messages` insert.

Conclusion: rendering this is not enough. The invite needs a **real row with a status** that both people can read and that updates live.

---

## 2. Design

### 2.1 Data — one new table, written by RPCs only

```sql
create table public.venue_invites (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'venue' check (kind in ('venue')),  -- 'meetup' later if the client wants it
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  thread_id    uuid not null references public.dm_threads(id) on delete cascade,
  message_id   uuid references public.dm_messages(id) on delete set null,
  venue_id     uuid references public.venues(id) on delete set null,
  venue_name   text not null,                       -- snapshot, so the card still reads if the venue changes
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  expires_at   timestamptz not null,                -- next 5 AM in the sender's city
  check (sender_id <> receiver_id)
);
-- One live invite per pair per venue per night (re-sending returns the existing one)
create unique index invites_one_per_night on public.venue_invites(sender_id, receiver_id, venue_id, expires_at);
create index invites_thread on public.venue_invites(thread_id);
```

- **RLS:** `select` is allowed when `auth.uid() in (sender_id, receiver_id)` and the two are not blocked. **No** insert/update/delete grants; every write goes through the RPCs below. This follows the same rule as `notifications` ("a recipient may mark read, never rewrite a source").
- **Realtime:** add the table to `supabase_realtime` so status changes reach the other phone.
- **Why `expires_at` uses the sender's city:** `nightly_reset()` already deletes `dm_messages` by the *sender's* city night. The invite has to die in the same pass as the message that carries it.

### 2.2 The DM message carries a pointer, not the data

The invite is posted into the thread as a `dm_messages` row whose text is `[invite:<uuid>]`, the same convention as `[shared_post:<uuid>]`. Ordering, realtime INSERT, read receipts, unread dots and the 5 AM delete then all work with no new code. The card reads its live status from `venue_invites`.

### 2.3 RPCs (security definer, `search_path=''`, bound to `auth.uid()`)

**`send_venue_invites(p_venue_id uuid, p_receivers uuid[])`** returns `table(invite_id, receiver_id, thread_id, notification_id)`.

For each receiver, in one transaction:
1. Skip the receiver if they are not a direct friend (`spotted_private.direct_friend`), are blocked, or are demo. This is the rule `create_notification` already applies to `venue_invite`.
2. Find or create the 1:1 thread with the logic of `create_dm_thread` (it runs as `auth.uid()`, so it is safe to call from inside).
3. Insert the `venue_invites` row. If the pair, venue and night already have one, reuse it and send nothing new.
4. Insert the `dm_messages` row `[invite:<id>]` and store its id back on the invite.
5. Insert the `venue_invite` notification with `data = {invite_id, thread_id, venue_id}` and the same message text as today, so the Activity row and the push keep working.

**`respond_to_venue_invite(p_invite uuid, p_accept boolean)`** returns the updated row.
- Only the receiver may call it. The invite must be `pending`, unexpired, and the two must still be direct friends. Otherwise it raises, and the client shows "This invite is no longer available".
- It sets `status` and `responded_at` and deletes the `venue_invite` request notification, which stops it reappearing as actionable in Activity (today's behaviour).
- **Accept:** inserts `venue_invite_accepted` ("Jane is down for San Vicente! 🎉") with `data.thread_id`, so the sender gets the existing push.
- **Decline:** no push by default (see open question Q2).

**`withdraw_venue_invites(p_ids uuid[])`** — used by Undo on the "Invites Sent!" card.
- Sender only, and only while the invite is `pending`. It deletes the invites, their `dm_messages` rows and their notifications in one transaction. This replaces `undoNotifications()` for venue invites, because deleting only the notification would now leave an orphan card in the thread.

### 2.4 Trigger and reset changes (same migration)

- **`notify_dm()`** — skip `text like '[invite:%'`. The `venue_invite` notification already pushes, so without this skip the receiver would get two pushes ("Jane: [invite:…]" plus "Jane invited you…").
- **`notification_source_visible()`** — for `venue_invite` / `venue_invite_accepted` rows that carry `data.invite_id`, also require the invite to still exist; a pending request must also still be `pending`. Older rows without `invite_id` keep today's `direct_friend` rule. ⚠️ This function is large. Redefine it from its **latest** version (`20260924213834_v1_plans_inbox_privacy.sql` and its rename chain) and change only the one branch.
- **`nightly_reset()`** — add `delete from invites where expires_at < v_now`, starting from its latest definition (`20260916130000_party_locations.sql`). Cascades already cover thread or account deletion.
- **Deleting an invite deletes its message** (an `after delete` trigger). This covers withdraw, account deletion and any manual cleanup in one place.

### 2.5 Push routing

- `send-push` (`case "venue_invite"` / `"venue_invite_accepted"`) forwards `thread_id` in the payload.
- `lib/push.ts → routeForNotification` sends `venue_invite` and `venue_invite_accepted` to `/thread?threadId=…` when `thread_id` is present, and falls back to `/activity` for older rows. Tapping the push therefore lands on the card the mockup shows.

---

## 3. Client (mobile)

| File | Change |
|------|--------|
| `src/lib/venue-invites.ts` | `sendVenueInvites(venueId, friends)` calls the new RPC and returns `inviteIds` + `threadIds`. Add `respondToInvite(id, accept)`, `withdrawInvites(ids)` and `fetchInvites(ids)`. Keep `undoNotifications` for meet-ups. |
| `src/lib/dm.ts` | `INVITE_REGEX = /^\[invite:([a-f0-9-]+)\]$/`; `previewText()` → "📍 Invite" (thread list and the Messages preview). |
| `src/hooks/use-thread-invites.ts` (new) | Same shape as the shared-post loader in `thread.tsx`: collect invite ids from messages, fetch them in one query, subscribe to `venue_invites` UPDATE filtered by `thread_id`, refetch on reconnect and focus, clear on `onNightBoundary`. This keeps the 937-line thread screen from growing a fourth inline loader. |
| `src/components/invite-card.tsx` (new) | `InviteCard({ invite, isMine, senderFirstName, receiverFirstName, onRespond })` renders the six states above. Accept/Decline are optimistic, roll back on failure and show a toast ("This invite is no longer available"). |
| `src/app/thread.tsx` | In `renderItem`, branch on `INVITE_REGEX` before the shared-post branch. The card takes the full bubble width (`max-w-[80%]`) and is **excluded from double-tap ❤️**. If its row can't be read (withdrawn, expired, unfriended), show "Invite no longer available", the same treatment as "Post unavailable or expired". Add `venue_invites` to `extraData`. Add a **"Tonight"** divider above the first message. An invite card shows its own time, so it gets no separate timestamp above it. |
| `src/app/activity.tsx` | Venue invite rows get **Accept / Decline** (Decline is new). For rows with `data.invite_id`, Accept calls `respondToInvite` and then opens the thread, where the card now reads "Accepted". Older rows without `invite_id` keep `acceptVenueInvite`. |
| `src/lib/meet-up.ts` | `acceptVenueInvite` stays only as the legacy path; it is no longer called for new invites. |
| `src/app/venue.tsx` | `submitInvites` passes `venue.id`. |
| `src/app/sent-confirmation.tsx` | For `kind === 'invites'`, Undo calls `withdrawInvites(inviteIds)` (new `inviteIds` param), and Chat opens the returned thread directly. |
| `src/lib/push.ts` | Thread routing as in §2.5. |
| `src/lib/database.types.ts` | Regenerate: `npx supabase gen types typescript --linked --schema public`. |
| `CLAUDE.md` | Short section on the contract: invites are rows, the card is a pointer, writes go only through RPCs, and the reset deletes them with the message. |

### 3.1 Visual spec (mockup → tokens, nothing re-declared in the screen)

- **Card:** `rounded-2xl`, `border border-white/15`, fill `bg-white/[0.06]` over the thread gradient, `p-4`, `gap-2.5`.
- **Header line:** 11pt, `text-white/60`. Icon 13pt `NEON`: `paperplane` (sent) / `bubble.left` (received).
- **Title:** 17pt `font-sans-semibold` white, `numberOfLines={2}`.
- **Venue line:** `mappin.and.ellipse` (or `mappin`) in `NEON` + 14pt white "at {venue}" / "to {venue}". Tapping it opens `/venue?venueId=` when `venue_id` is set.
- **Status pill** (`h-7 px-2.5 rounded-full`, 12pt):
  - Pending: `bg-white/10`, `text-white/70`, `clock`.
  - Accepted: `NEON` at ~15% fill, `NEON` text, `checkmark`.
  - Declined: `RECORD_RED` at ~15% fill, `text-white/70`, `xmark`.
- **Accept:** `primaryControl` / `primaryControlText` (lime, INK text) + `checkmark`. **Decline:** `outlineControl` + `xmark`. Both are `min-h-11 flex-1 rounded-full`, so Dynamic Type can grow them.
- **Time:** 11pt `text-white/45`, right-aligned, same format as `timeLabel()` but upper-case "PM" as in the mockup.
- Montserrat 400/500/600 only. Every SF symbol name is checked against `node_modules/sf-symbols-typescript` before use.
- The mockup's composer has no photo button. That is a mock simplification; we **keep** ours.

---

## 4. Edge cases

- **Several recipients from the venue picker:** each gets their own card in their own 1:1 thread with the sender. The sender sees one Pending card per thread.
- **Same invite sent twice tonight:** the RPC returns the existing invite, so there is no second card or push.
- **Both people tap at once:** only the receiver can respond, and the RPC checks `status = 'pending'` under a row lock, so the second call fails cleanly.
- **Unfriended or blocked while pending:** `respond_to_invite` refuses, and the RLS select hides the row, so the card shows "Invite no longer available". `relationship_events` already refetches private views.
- **5 AM:** the message, the invite and the notifications all go in the same `nightly_reset()` pass, and the thread already clears on `onNightBoundary`.
- **Demo friends:** skipped, as today (they are not in `auth.users`).
- **Older app builds and the web app:** they render `[invite:<id>]` as raw text in the thread. Older builds that still call `create_notification('venue_invite')` keep working but produce no card. That is acceptable for TestFlight. If the web app is still in front of users, its thread needs the same regex, or at least the preview text.
- **Legacy `venue_invite` rows already in Activity tonight** (no `invite_id`) keep the old Accept path until the reset clears them.

---

## 5. Order of work

1. **Migration** `supabase/migrations/20261005xxxxxx_dm_invite_cards.sql`: table + RLS + realtime, three RPCs, `notify_dm` skip, `notification_source_visible` branch, `nightly_reset` line, the delete-message trigger. Apply to the linked project and regenerate types.
2. **SQL checks** (psql, as two users): a non-friend can't send; a blocked pair can't send; the sender can't accept; a second response fails; withdraw after accept fails; the reset removes all three rows; exactly one notification and one push per invite.
3. **`send-push` + `lib/push.ts`** thread routing.
4. **`invite-card.tsx` + `use-thread-invites.ts`**, wired into `thread.tsx`.
5. **Activity** Accept/Decline, **venue.tsx** venue id, **sent-confirmation** Undo/Chat.
6. **Device test with two accounts** (the Lahore test city works): walk all six mockup states on both phones and confirm each change shows up live on the other phone without a refresh. Also test push → card, Undo from "Invites Sent!", and the 5 AM boundary (`nightly-reset-lhr`).
7. **e2e flow** (`mobile/.claude/skills/e2e`): send → Pending → accept on the second sim → Accepted on the first.
8. Add the CLAUDE.md section, then `npx expo run:ios` (no new native modules, so no prebuild is needed).

Rough size: migration + checks ~1 day, client ~1–1.5 days, two-device QA ~0.5 day.

---

## 6. Questions for the client before building

1. **Meet Ups too?** The mockup is titled "the venue version". Should Meet Up requests get the same card ("Jane wants to meet up" + Accept/Decline)? The table is built so this only adds `kind = 'meetup'`.
2. **Decline: tell the sender?** The plan only updates the card live, with no push. Some apps send a quiet "Jane can't make it" notification. Which one?
3. **Can the sender cancel from the card?** Today Undo exists only on the "Invites Sent!" screen right after sending. Should a pending card also have "Cancel invite"?
4. **Accept: anything beyond the card?** For example, offer "Set me Out at San Vicente". The plan keeps Accept to the card plus the sender's push.
5. **"5 AM" vs "5am":** the mockup strip says "5 AM", but the app copy (`RESET_COPY.dmThread`) says "5am" everywhere. Change it app-wide or leave it?
6. **Avatar next to received cards:** the mockup has none, but the thread shows the sender's avatar next to every received bubble. Should cards follow the mockup or match the thread?

### Decisions taken when building (Oct 5 2026)

1. Meet Ups: **yes**, the same card ("Meet up request sent to Sophie" / "Jane wants to meet up"). It shows the receiver's venue when the sender could already see it.
2. Decline **pushes the sender** (`venue_invite_declined`: "Jane can't make it to San Vicente"), as Accept does.
3. No "Cancel" on the card. Undo on the confirmation withdraws a pending invite or meet up, and the friend card's Meet Up button still cancels or clears tonight's meet up for either person.
4. Accept does nothing beyond the card and the sender's push.
5. Copy stays "5am", the app-wide style. Not changed for one strip.
6. Received cards follow the mockup: no avatar beside them.

### Change after device testing (Oct 5 2026)

The client wants **no blocking**: anyone can send the same person another Meet Up or venue invite at any time, including after an answer. Migration `20261005140000_invites_allow_repeat.sql` drops the once-per-night unique indexes and `cancel_meetup`; the only guard left is a 30-second double-tap check. `send_meetup` always returns `sent`. The friend card, Home and Plans Meet Up buttons always read "Meet Up" again. Undo on the confirmation still withdraws an unanswered request.
