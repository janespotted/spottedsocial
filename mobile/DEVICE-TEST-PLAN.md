# Two-device verification — Nadeem (simulator) + Asif (real device)

Addendum v3 §7 and §10 ask for this before the next TestFlight. Work top
to bottom: setup first, then the launch-blocking regressions (§8), then the
features. Tick each box; anything unticked is a real finding worth sending
back.

**Roles.** Nadeem = simulator. Asif = real iPhone. Where a step says
"both", do it on each device.

---

## 0. Setup (do this once)

- [ ] Both devices on the same build, installed today.
- [ ] Sign in as Nadeem on the simulator, Asif on the phone
      (test numbers `15550000001`…`15550000010`, code `123456`, or real
      numbers if Twilio is live).
- [ ] **Both:** Settings → Demo Mode **on** → City row → **Lahore**.
- [ ] **Both:** Profile → Friends — send and accept a friend request so
      Nadeem and Asif are friends. Several checks below need this.
- [ ] **Asif (phone):** allow notifications and allow location
      **"While Using the App"** when asked. Push cannot be tested on the
      simulator — it has no APNs token — so every push check is Asif's.
- [ ] Confirm the venue list looks like Lahore: Map or Search →
      Trending Tonight should show Gulberg / MM Alam / DHA spots.

> If Lahore venues do not appear, demo mode is off or the city did not
> save. Re-check Settings before going further.

---

## 1. Friend presence on the map — §8.4, the client's top bug

This is the one Jane called the most important. Take your time.

- [ ] **Both:** go out — status pill → Yes → pick a Lahore venue →
      Share my spot.
- [ ] **Nadeem:** Map — Asif's avatar pin appears **without pulling to
      refresh**, within a few seconds.
- [ ] **Asif:** Map — Nadeem's pin appears the same way.
- [ ] **Asif:** lock the phone for 2 minutes, then look at Nadeem's map.
      **Asif's pin must still be there.** Disappearing on lock alone was
      the reported bug.
- [ ] **Asif:** background the app for 5 minutes, reopen. Both maps still
      show both people.
- [ ] Leave both out for **over 2 hours** without moving, then check the
      maps again. Pins must still be present — possibly faded, which is
      correct — but not gone. This is the specific fix; a shorter test
      will not exercise it.
- [ ] **Asif:** Stop sharing → Nadeem's map drops the pin within seconds.
      That is the *only* way a pin should vanish mid-night.
- [ ] Tap a pin → the friend card opens over the map → close it → the map
      returns to exactly the position and zoom it had.

## 2. Push notifications — §8.6

All of these are **Asif receiving on the phone**, triggered by Nadeem.
Watch both the banner and where the tap lands.

- [ ] **DM:** Nadeem sends Asif a message → banner arrives → tapping it
      opens **that conversation**, not the inbox.
- [ ] **Meet up:** Nadeem opens Asif's friend card → Meet Up → Asif gets
      "Meet Up Request" → tap → Activity.
- [ ] **Venue invite:** Nadeem opens a venue → Invite friends here →
      select Asif → Send → Asif gets "Venue Invite!" → tap → Activity.
- [ ] **Plan invite:** Nadeem creates a plan and tags Asif → Asif gets
      "Plan Invite!". *This path was silently dead until this week —
      worth confirming.*
- [ ] **Post tag:** Nadeem posts and tags Asif → Asif gets "Tagged You".
- [ ] **Asif:** turn notifications off in iOS Settings → Spotted →
      Settings in the app shows "Off in iOS Settings — tap to enable" →
      tapping opens iOS Settings → turn back on → the row says On again
      without reinstalling.

## 3. Keyboard — §8.2

- [ ] Open a DM, tap the field, type, then go **back**. The keyboard must
      close. (This was the original report.)
- [ ] Same with the swipe-back gesture.
- [ ] Comments: type, tap Send → keyboard closes, comment appears.
- [ ] Comments: with the keyboard up, tap a comment's like button — it
      registers on the **first** tap.
- [ ] Yap: type, post → keyboard closes.
- [ ] Edit profile: tap a field, then tap empty space → keyboard closes;
      Save is never hidden behind it.
- [ ] Search: open, type, Cancel → keyboard closes and does not reopen
      when you return.

## 4. Yap votes — §8.5

- [ ] **Both:** check in at the **same** Lahore venue.
- [ ] **Nadeem:** Chat → Yap → open that venue → post a yap.
- [ ] **Asif:** same thread → upvote it → the count goes 0 → 1 immediately.
- [ ] **Asif:** pull to refresh → still 1 (not back to 0).
- [ ] **Nadeem:** refresh → sees 1.
- [ ] **Asif:** double-tap the vote button fast → the count must not jump
      to 2 or go negative.

## 5. Refresh and recenter — §8.1, §8.3

- [ ] Pull to refresh on Feed, Plans, Messages, Leaderboard, Friends and
      Profile. Each finishes once; no spinner that restarts itself.
- [ ] Switch tabs quickly several times — no stuck loading state.
- [ ] Map: pan far away, tap the recenter button → the map centres on
      **you**, not the city centre, and keeps its zoom.
- [ ] Recenter must not change your status, audience or filters.

## 6. The 5 AM reset — §4

Two ways to do this. The honest one is to test near 5 AM Lahore time. The
practical one is to change the device clock.

- [ ] Before the reset: post something, send a DM, post a yap, send an
      invite, and be checked in.
- [ ] **App open through 5 AM:** the feed empties, the DM thread clears,
      the yap list clears and the status returns to unanswered —
      **without force quitting**.
- [ ] **Backgrounded through 5 AM:** reopen → no stale content flashes
      before it clears.
- [ ] After the reset, your own pin is gone from the other person's map.
- [ ] Tap an old push from before the reset → **"This post expired at
      5am"**, not a blank screen or an error.
- [ ] Profile, friends, Close Friends and saved venues all survive.

## 7. Friend card, invites and meet ups — §1

- [ ] Friend card from a map pin shows: avatar, name, venue, relationship
      badge, distance, and **Meet Up + Chat**.
- [ ] Tap the relationship badge → switch Close Friend ↔ Friend → the ring
      colour on the map changes accordingly.
- [ ] Badge → Remove friend → confirm → **Undo** in the toast restores
      them.
- [ ] Overflow → Hide my location → the other device stops seeing your
      pin; undo it afterwards.
- [ ] Send a venue invite → the **"Invites Sent!"** card appears with
      confetti, names and venue → **Undo** → the invite disappears from
      the other person's Activity.
- [ ] Meet Up → the confirmation card appears → Chat opens the DM.

## 8. Tag friends — §9.3

- [ ] Post with Asif tagged → the feed card shows "with Asif", tappable →
      opens his card.
- [ ] Asif sees the tag on his copy of the post.
- [ ] Set a post to **Close Friends** and tag someone who is *not* a close
      friend → they must not see the post **or** the tag.

## 9. Search and the rest of §11

- [ ] Search with an empty field shows **Friends Out Now** and **Trending
      Tonight**.
- [ ] Type "Gul" → Gulberg appears under Neighborhoods with a spot count.
- [ ] People / Venues chips narrow the results.
- [ ] Profile while out → **Change venue** → lands straight on venue
      selection, not the whole Yes flow.
- [ ] Venue card → **Yap** → opens that venue's thread.
- [ ] DM composer → attach → **Take a photo** opens the Spotted camera.

---

## What to send back

For anything unticked: the step number, what you expected, what happened,
and a screenshot or recording. Note which device, since several of these
behave differently on the simulator.

**Known limits, not bugs:**
- Push never arrives on the simulator. All §2 checks are Asif's phone.
- Demo mode also shows seeded demo users and content; that is the same
  switch, deliberately.
- Lahore venues only exist while demo mode is on.
