# Spotted Swift Fidelity + 5AM Reset + QA Regressions

*Addendum v3 — includes WhatsApp QA + full recording-to-recording parity audit*

> **IMPORTANT — DO NOT REPLACE THE PREVIOUS BRIEF**
> The prior 9-page “Spotted App Flow and Interface Changes” document remains in effect and is already being worked on. This addendum is intentionally limited to newly identified missing interactions, Swift-vs-original fidelity issues, and a more specific 5AM Reset system. If an item below overlaps the prior brief, this document clarifies the intended implementation rather than removing the earlier requirement.

Priority for this addendum: the items labeled P0 should be treated as launch-blocking. The goal is not to redesign the app again; it is to restore the parts of the original build that gave Spotted its social personality and make the nightly reset understandable everywhere it matters.

## 1  P0 — Restore original-build social interactions

The Swift rebuild should use the original demo build as the visual and interaction source of truth whenever the same feature already existed. New Swift-native behavior is fine where functionality is genuinely new, but existing components should not be simplified, removed or materially restyled without approval.

### Friend card on the map — restore this interaction

This is a missing feature, not a cosmetic refinement. In the original build, tapping a friend surfaced a branded friend card over the map with Meet Up + Chat actions and relationship context. The supplied recording does not show confetti on card open; the confetti appears after a successful invite is sent. Restore those as two separate interactions.

- Tap target: tapping an individual friend profile pin on the map, or tapping that friend from a map-based people list, opens the friend ID card.
- Presentation: keep the map visible behind a compact card/sheet. Do not replace the map with a full-screen profile page.
- Card content: profile photo, first name, relationship badge (Close Friend / Friend / Mutual as applicable), tonight status, current shared venue if visible to me, and any existing short social context from the original build.
- Friend-card actions: restore the original hierarchy — large primary “Meet Up” button plus a separate Chat icon/button. Chat opens the 1:1 Spotted DM when messaging is allowed. Meet Up launches the applicable meetup/invite flow. Preserve the overflow menu and relationship control shown in the original.
- Confetti behavior: do not fire confetti simply because the friend card opened. In the original recording, confetti accompanies the successful invite confirmation card after the invite is sent. Restore that success-state animation there.
- Dismissal: swipe down / close the card and return to the exact same map position and zoom.
- Navigation: if I tap Chat and then go back, return me to the same person/map context rather than resetting the map.
- Privacy: only show venue/location details that the viewer is already allowed to see under the selected sharing audience. The card must never broaden access.

### Map should feel people-first again

- Use recognizable friend/profile-photo pins for individual people, with the approved relationship treatment. Generic numbered purple circles should not replace individual people at normal zoom.
- Use numeric clustering only when multiple people genuinely need to be collapsed at the current zoom level; expanding the cluster should resolve back into people/profile pins.
- Keep venue pins visually distinct from people pins. A user should understand “people” versus “places” without opening a filter.
- When a friend is selected, their card and profile pin should feel connected visually so it is obvious who the card belongs to.

### General Swift fidelity rule

- Match the original build’s information density, card hierarchy, image prominence, spacing, typography scale, color balance and interaction patterns unless a specific newer requirement says otherwise.
- Do not independently replace branded interactions with generic iOS pills, large empty panels or simplified utility screens if the original already had a designed Spotted treatment.
- Seed the Swift app with a demo account containing enough fake friends, venues, posts, Yaps, meetups, invites and DMs to compare populated states directly against the original build. Empty states are not sufficient for visual QA.

## 2  P0 — Define the 5AM Reset as one system

The reset needs to be a product rule, not a note that only appears under posts. Users should understand that Spotted is for the current night and that the social layer clears at 5am.

> **Recommended umbrella language**
> “Tonight resets at 5am.”
> Supporting explanation: “Your live location, posts, Yaps, DMs, meetups and invites from tonight disappear at 5am. Tomorrow starts fresh.”

### What must reset at 5am

- Out / TBD status for the night.
- Active venue check-in and live/shared location for the night.
- Posts from that night, including associated comments/replies and visible engagement tied to the expired post.
- Yaps from that night.
- 1:1 DMs sent through Spotted that night.
- Meetup requests sent or received that night.
- Venue/friend invites sent or received that night.
- Night-specific in-app notification cards or activity items that would otherwise expose or deep-link to expired content.
- Any live “who is out / who is here” state derived from those expired check-ins.

### What should NOT reset

- Account, profile, username and profile photo.
- Friend graph, Close Friends list and mutual relationships.
- Saved venues / bookmarks and non-nightly settings.
- Audience preferences the user explicitly chose, unless we decide otherwise later.
- Any permitted Morning After Debrief artifact, subject to the data-retention rule in Section 5 below.

### Reset timing

- For the NYC beta, 5am means 5:00 AM Eastern Time for the active NYC night. Do not rely only on the phone clock.
- The reset should be enforced server-side so changing device time, backgrounding the app or being offline at exactly 5am does not preserve old nightly content.
- Longer term, architect the rule around the active nightlife market/city time zone so every market resets at 5am local time.

## 3  P0 — Exact 5AM messaging placement by screen

Do not show the full explanation everywhere. Use one strong onboarding explanation, then short contextual reminders at the moment a user is creating or viewing something that will expire. The goal is consistency without making the app feel like a privacy warning screen.

| **Screen / flow** | **Exact placement** | **Exact copy / behavior** |
|---|---|---|
| Onboarding / first-run education | Dedicated onboarding card/screen after the basic “what Spotted is” explanation and before or near location/privacy education. | Title: “Tonight resets at 5am.” Body: “Your live location, posts, Yaps, DMs, meetups and invites from tonight disappear at 5am. Your profile and friends stay. Tomorrow starts fresh.” |
| Required “Are you out tonight?” sheet | Small footer line underneath Yes / TBD / No, above the bottom safe area. Do not add another required tap. | “Tonight resets at 5am.” Add a small info icon that opens the full explanation sheet. |
| Yes → venue confirmation | Under the visibility row and above/below the primary “Share my spot” CTA in secondary text. | “Your status + shared spot clear at 5am.” |
| TBD status sheet | Directly below “Share TBD status” supporting copy. | “Your TBD status clears at 5am.” |
| Active status on Map / Profile | In the current-status card/pill, near the venue/audience metadata. | Use “Live until 5am” or “Shared until 5am.” Do not bury this only in Settings. |
| Friend card | Small secondary line underneath the friend’s visible venue/status when their location is being shown. | “Shared for tonight · clears at 5am.” Keep this subtle; do not change the original Meet Up + Chat action hierarchy. |
| Plans landing screen | Persistent but compact info row underneath the Plans header, not a modal. | “Tonight resets at 5am — meetups + invites disappear then.” |
| Send Meetup composer | Immediately above the final Send button. | “This meetup disappears at 5am.” |
| Meetup sent / received card | Small metadata line beside/under the time or status. | “Expires at 5am.” Confirmation toast after sending: “Meetup sent · expires at 5am.” |
| Send Invite flow | Immediately above the final Send Invite action. | “This invite disappears at 5am.” |
| Invite sent / received card | Small metadata line on the card. | “Expires at 5am.” Confirmation toast: “Invite sent · expires at 5am.” |
| Post preview before Share | Always visible immediately above the Share button, next to the audience/venue metadata — not hidden below the fold. | Clock icon + “Disappears at 5am.” |
| Published post / feed card | Small metadata treatment with the post time. Do not add a large banner to every card. | Use “Tonight · until 5am” or a small clock/“5am” treatment. Comments disappear with the post. |
| Yap venue feed | Under the venue/Yap header as a compact persistent line for the active session. | “Tonight’s Yap · clears at 5am.” On first use, show the longer explanation once. |
| 1:1 DM thread | Directly under the person’s name in the chat header, or as a slim system row pinned above the first message. | “Tonight only · messages clear at 5am.” |
| New Chat / empty DM state | Above the composer the first time a user starts a chat that night. | “Messages sent here clear at 5am.” |
| Notifications / Activity | On meetup/invite notifications that are still active; old items should not stay actionable after reset. | “Expires 5am.” If an OS push is tapped after 5am, show a graceful “This expired at 5am” state rather than an error. |
| Morning After entry | On the debrief card when it appears the next morning. | “Last night reset at 5am.” This helps teach the system through repetition. |
| Settings / Privacy | Permanent explanatory row called “5AM Reset.” | Full explanation of what clears vs. what stays, using the same list as onboarding. |

## 4  P0 — 5AM behavior, not just copy

The messaging only works if the product behavior matches it. At 5:00 AM, all affected nightly objects should become inaccessible together.

- A post/Yap/DM/meetup/invite created at 4:59am should expire with the rest of that night at 5:00am. It should not receive a new 24-hour life because it was created late.
- If the app is open at 5am, update the UI without requiring a force quit. Active map pins, status cards, posts, Yap content, DMs, meetup cards and invite cards should clear or transition cleanly.
- If the app is backgrounded or offline at 5am, reconcile immediately on next foreground / reconnect and do not briefly show stale nightly content.
- Deep links and push notifications to expired content must fail gracefully: “This expired at 5am.” Never show a generic server error or an empty broken detail screen.
- Do not keep expired message/post previews in cached UI. A previous DM preview, post thumbnail or meetup text should not remain visible after the underlying object expired.
- If a user was Out, the live location session must end at reset. They should not continue appearing at last night’s venue in the morning.
- The next night should start as a clean slate while preserving the account/friend graph and approved preferences listed above.

## 5  P0 clarification — Morning After vs. “everything disappears”

The existing brief asks the Morning After Debrief to show the user’s own pictures and Yaps from the previous night. That conflicts with a literal promise that all source content is permanently deleted at 5am unless we define a separate retention rule.

> **For the beta, use “disappears” / “clears,” not “permanently deleted.”**
> User-facing nightly content must disappear from the live/social product at 5am. Do not ship copy promising permanent backend deletion until we have confirmed how the Morning After Debrief, backups, analytics and any retained private recap data work. If we later decide to make a hard-deletion promise, the backend and Morning After design will need to be adjusted to match it.

Recommended beta behavior: generate the Morning After experience as a separate private recap artifact. The live posts/Yaps/DMs/meetups/invites are no longer available in their original social surfaces after 5am. Any content retained inside the private recap must be explicitly defined and should never recreate another person’s expired private content without permission.

- DMs should not be copied into the Morning After recap.
- Meetups and invites should not be copied into the Morning After recap.
- If the recap retains the user’s own photos/Yaps, treat that as a private recap exception and disclose it accurately in the 5AM Reset explanation before using “deleted” language anywhere.
- If we decide instead that literally all nightly content is hard-deleted at 5am, remove photos/Yaps from the Morning After Debrief and keep only derived stats that can be safely retained.

## 6  P0 — Fast implementation / review cadence

To keep this from turning into another long redesign loop, please handle this as a short fidelity + reset sprint rather than scattered individual tweaks.

1. Create/refresh the seeded demo account first so all major populated states can be reviewed in Swift.
2. Restore the friend card, Meet Up + Chat actions, people-first map behavior, and the separate “Invites Sent!” success card/confetti interaction.
3. Implement one centralized nightly reset rule for status/location, posts, Yaps, DMs, meetups and invites rather than separate one-off timers.
4. Add the exact 5am messaging placements above after the behavior is wired correctly.
5. Then complete the broader visual parity pass across Plans, Feed, Invite Friends, Yap/DMs, navigation, typography and spacing.
6. Provide one consolidated TestFlight build per review cycle with a short changelog of which numbered items are done, in progress or blocked.

### Definition of “done”

- A feature is not done because the underlying function exists. It is done when the populated Swift state visually and behaviorally matches the approved interaction and passes the QA cases below.
- Please do not silently redesign or remove an existing interaction to save implementation time. If something from the original build is unusually difficult in Swift, flag it before substituting a different experience.

## 7  Verification before completion

- Tap a friend on the map → friend card appears over the map → Meet Up and Chat are both visible → Chat opens the correct DM → Back returns to the same map context. Then send an invite and verify the separate “Invites Sent!” confirmation card + confetti state.
- Confirm individual people use recognizable profile pins at normal zoom and numeric clusters only appear where clustering is actually needed.
- Create a check-in, post, Yap, DM, meetup and invite before reset. At 5:00am, confirm all six expire together and the live location/status also ends.
- Create the same objects at 4:59am. Confirm they still expire at 5:00am rather than lasting into the next day.
- Leave the app open through 5am and confirm the screen updates without force quitting.
- Background the app before 5am and reopen after 5am; confirm no stale nightly content flashes before reconciliation.
- Go offline before 5am and reconnect after 5am; confirm old nightly objects are not restored as active content.
- Tap an old push/deep link after reset and confirm the user sees “This expired at 5am” rather than an error or stale content.
- Verify the exact 5AM copy is present in onboarding, status setup, Plans, meetup/invite composers, post preview, Yap, DMs, active status and Settings as specified above.
- Verify Close Friends / Friends / Friends + Mutuals privacy still controls who can see location/status even though the 5AM expiration rule is universal.
- Verify the Morning After Debrief follows the chosen retention approach and does not contradict the 5AM promise.

Please reply to this addendum with: (1) which P0 items are already implemented, (2) which are not yet implemented, (3) any technical blockers, and (4) the order you plan to complete them. Continue using the original brief for all previously requested changes.

## 8  P0 — WhatsApp QA regressions to close before beta

These issues were reported during hands-on TestFlight testing on September 14–15. Treat them as open until they are reproduced, fixed and retested. Most are regressions or broken behavior, not new product features. “Acknowledged” in WhatsApp does not mean the item is closed.

> **SCOPE CLASSIFICATION**
> Regression / bug = something expected to work but currently does not. Fidelity regression = an original Spotted interaction or treatment disappeared or was replaced in Swift. New feature = genuinely new functionality. Please keep these categories separate in the tracker so core bug fixes are not mixed with optional scope expansion.

### 8.1 Refresh can get caught in a loop — P0 regression

Reported in the WhatsApp QA video on September 14. A manual refresh should complete once; the app should not get stuck repeatedly refreshing or leave the user trapped in a loading state.

- Reproduce the exact loop shown in the reference video already sent in WhatsApp, then audit any shared refresh/loading component used on other tabs.
- One refresh action should trigger one refresh cycle. Prevent duplicate overlapping requests or state changes from recursively retriggering refresh.
- On success, stop the loading state and show the updated screen. On failure, stop loading and show a usable Retry state rather than looping.
- Done when: repeated manual refreshes and tab switches no longer produce an infinite/repeating refresh state.

### 8.2 Keyboard stays open when it should dismiss — P0 regression

The keyboard was still remaining on screen during TestFlight QA. It should never stay pinned over the interface after the user has finished or left the input interaction.

- Dismiss on Send/Submit, Cancel/Close, tapping outside where appropriate, closing a sheet, and navigating away from the composer/input screen.
- The keyboard must not cover the primary action, bottom navigation or content after the relevant input flow ends.
- Returning to the screen should restore the correct UI state rather than automatically reopening the keyboard unless the user intentionally focuses an input.
- Done when: test the comments composer, DMs/Yap inputs, search fields and any other shared composer that uses the same keyboard behavior.

### 8.3 Current-location button recenters the map to the wrong place — P0 regression

Tapping the current-location/recenter control must center the map on the user’s actual current location. In QA it was driving the map to the wrong place.

- Use the current valid device location and respect normal accuracy handling; do not recenter to a selected venue, another user, an old cached coordinate or an unrelated map region.
- Recenter should not silently change the user’s sharing audience, check-in, status or selected filters.
- If a current location cannot be obtained, show an understandable state/permission path rather than moving the map somewhere incorrect.
- Done when: current-location behavior is correct after cold launch, foreground return, venue selection and map panning.

### 8.4 Friend presence / map sync is unreliable — P0 launch blocker

This is the most important WhatsApp bug. During two-user testing, a friend appeared only after a delay, then the avatar disappeared after that friend locked the phone; later the two users stopped appearing on each other’s maps entirely.

- If User A and User B are actively sharing to an audience that includes each other, each should appear on the other person’s map without requiring a manual refresh.
- Locking the phone or backgrounding the app must not by itself remove an active friend pin. If background location updates are limited, keep the valid active check-in/last shared spot visible according to the product rules and indicate freshness appropriately rather than making the person disappear.
- A friend should disappear only for a defined reason: Stop sharing, status/location reset, audience/privacy change, relationship/block change, expired 5AM night, or another explicit rule.
- Test two devices in both directions: A sees B and B sees A. Test foreground → phone lock → background → reopen → move/check in again → stop sharing.
- Done when: cross-user map state stays synchronized through those transitions and a lock-screen event alone does not remove the avatar.

### 8.5 Yap upvote count does not update — P0 regression

An upvote was tapped during QA and the visible count remained at 0. The engagement state must update reliably.

- On a Yap with 0 votes, tapping upvote should immediately reflect the user’s vote in the UI and persist after refresh/reopen.
- The updated count should synchronize to a second test account/device rather than only changing locally.
- Prevent duplicate taps from creating duplicate votes. If unvoting is supported, the count/state should reverse correctly.
- Expired Yaps and their vote state should clear with the 5AM Reset.

### 8.6 Push / in-app notifications are not arriving — P0 regression

Notifications were reported as not coming through. Before beta, verify the complete notification path rather than only confirming that notification code exists.

- Verify notification permission handling, APNs/device-token registration, backend send, receipt on a physical device and the correct in-app/deep-link destination when tapped.
- Test the notification categories already supported by Spotted, especially DMs and any meetup/invite/social notifications intended for beta.
- If notifications are disabled at the OS level, show an understandable path to enable them rather than failing silently.
- Notifications tied to nightly content must follow the 5AM rule: after reset, stale pushes/deep links should resolve to “This expired at 5am,” not broken content.

### 8.7 Friend card + invite-success interaction is missing — P0 fidelity regression

Already specified in Section 1 and reported again in WhatsApp QA. Restore the actual friend-card interaction (Meet Up + Chat + relationship context) and the separate post-invite “Invites Sent!” confirmation with confetti. Do not close this item because the friend profile can be reached another way.

### 8.8 A branded dropdown from the original build was replaced — P1 fidelity regression

The September 15 WhatsApp reference explicitly called out that this control “was a dropdown before in the Spotted format.” Restore the original dropdown interaction/styling rather than using a generic replacement.

- Use the original-build video and the WhatsApp screenshot already sent as the visual source of truth for this specific component.
- If this is the audience/status dropdown, it must also follow the Close Friends / Friends / Friends + Mutuals terminology and bottom-sheet behavior in the original 9-page brief.
- If the referenced screenshot is not available in the implementation tracker, flag it rather than guessing which component Jane meant.

### 8.9 Unclear microphone control — P1 UX cleanup

During QA the microphone icon was not understandable (“What’s the mic”). There should not be an unexplained control in a core flow.

- If microphone/voice input is not an intended beta feature, remove the icon from that screen.
- If it is intended, make the action discoverable and test permission-denied behavior; the purpose should be obvious without trial-and-error.

### 8.10 External beta OTP / Twilio reliability — P0 beta infrastructure

Test accounts currently work, but the chat also identified a Twilio-side issue that needed dashboard attention. Before inviting real beta users, verify that a normal external user can complete phone authentication without relying on hard-coded tester numbers.

- Request OTP from a non-test beta phone number, receive it, authenticate successfully, sign out and repeat.
- Handle resend, invalid code, delayed code and rate-limit states cleanly.
- Do not ship an external beta that depends on developer-provided test phone numbers for normal onboarding.

## 9  P1 — Other WhatsApp requests already made; keep them on the tracker

These were also requested or agreed in WhatsApp. They are listed here so they do not get lost, but they should not delay the P0 stability/fidelity fixes above unless they are already bundled into the current implementation work.

### 9.1 Brand color consistency across the app — fidelity

- Use the approved Spotted brand book / color reference already sent as the source of truth across Map, Feed, Plans, Yap, Messages, Profile, onboarding, sheets, buttons and selected/unselected states.
- Do not introduce one-off purples, lime/yellow treatments or generic system colors that make different tabs feel like different products.

### 9.2 Elevated onboarding — existing design request

- Use the onboarding reference sent in WhatsApp on September 15 as the visual/content direction: more specific, smoother flow and more elevated presentation.
- Avatars can be used for sample profile pictures in onboarding; the screens should demonstrate real Spotted behavior rather than generic app-marketing copy.
- Integrate the dedicated “Tonight resets at 5am” education from Section 3 of this addendum into that onboarding flow rather than creating a separate disconnected style.

### 9.3 Tag friends in feed posts — P1 new feature

This is genuine new functionality, not a bug/regression. Track it separately from the P0 fixes so it does not obscure launch stability.

- Add a clear “Tag friends” action in the post preview/composer after media is selected.
- Allow the user to search/select Spotted friends and show the selected tags before posting.
- Show tagged friends on the published post in a simple Spotted-native treatment; tapping a tagged friend should open the appropriate profile/friend context if permitted.
- Tagging must not broaden the post audience. A tag does not override Close Friends / Friends / Friends + Mutuals privacy.
- Tagged-post references/notifications should expire with the post at the 5AM Reset.

### 9.4 Feed videos should start playing immediately — P1 performance/UX

This was also identified by the developer in WhatsApp as work that needs to be done.

- When a video post becomes the active/visible feed card, playback should begin promptly without requiring a separate tap just to start the video.
- Avoid a long blank frame or visible loading stall; preload/buffer enough to make the feed feel immediate within reasonable network constraints.
- Preserve the currently approved sound/mute behavior; this requirement is about start latency and feed smoothness, not changing the audio policy.

### 9.5 Approved glowing S / favicon asset — brand asset

- Use the approved glowing S treatment for the favicon/brand asset where that surface is in this developer’s scope, as already agreed in WhatsApp.

## 10  Updated QA / release cadence

The camera/composer work can continue in parallel, but do not hold all stability and fidelity fixes until one large final build. Continue the incremental TestFlight cadence already agreed in WhatsApp so issues can be verified while development continues.

- Ship a TestFlight build at least on the every-other-day cadence already discussed while this sprint is active, unless a build is genuinely blocked.
- Each build should include a short changelog using the section/item numbers in this document: Fixed / In progress / Blocked / Not started.
- Do not mark a bug Fixed until it has been exercised on a physical device. For two-user behavior, test with two accounts/devices.
- Prioritize the next build around: friend-map synchronization, current-location recentering, notifications, keyboard dismissal, refresh loop, Yap vote state and friend ID card restoration.
- P1 visual/new-feature work can follow once the P0 experience is stable, except where a P1 item is already nearly complete and does not slow the P0 fixes.

### Minimum regression test for the next TestFlight

- Two accounts share Out status to each other → both appear on each other’s maps → lock one phone → friend remains visible appropriately → reopen → state is still synchronized.
- Tap current-location control from a panned/selected map state → map recenters to the correct user position without changing status, audience or filters.
- Open and dismiss inputs across comments, DM/Yap and search → keyboard dismisses cleanly and never blocks the bottom navigation/primary CTA.
- Refresh the screen that previously looped multiple times → each refresh finishes once and the app remains usable.
- Upvote a zero-vote Yap → count/state updates immediately → refresh/reopen → second test account sees the synchronized count.
- Trigger each supported beta notification on a physical device → notification arrives → tap opens the right destination → expired nightly content fails gracefully after 5am.
- Tap a friend pin → branded friend card appears over map → Meet Up + Chat are visible → Chat opens correct DM → Back returns to same map state. Send an invite → “Invites Sent!” card appears → brief confetti plays → Undo/Chat actions work.
- Verify the referenced original-build dropdown uses the approved Spotted treatment rather than the generic replacement.
- Verify external/non-test phone OTP onboarding works end to end before sending beta invites.

> **REQUESTED RESPONSE FORMAT**
> Please reply against Sections 8–10 with: Fixed / In progress / Blocked / Not started. For each Blocked item, include the blocker and what you need. For regressions, please do not substitute a redesigned experience without flagging it first. The original 9-page brief and Sections 1–7 of this addendum remain active.

## 11  Full recording-to-recording parity audit

**Why this section exists:** the earlier addendum captured the major regressions, but some visual/interaction differences were only covered by a broad “match the original” instruction. That is not specific enough. This section turns every meaningful difference visible in the two supplied recordings into an explicit implementation/verification item. Do not treat duplicate points here as new scope; they clarify the approved target.

### 11.1 Home / Newsfeed

- Original build: populated feed cards are the visual focus — compact person/venue header, large photo/video, simple heart/comment/share actions, and strong nightlife imagery. The current Swift recording is mostly an empty-state screen, so populated-card parity cannot be judged yet.
- Restore/verify the persistent “friends out / TBD” social-status pill shown near the lower-left of the original feed (for example “16 out · 5 TBD”). Tapping it should open a compact roster with friend avatars, names and current shared venue/status — not a generic full-screen list.
- Keep the floating lime “+” action visually separated from the feed content as in the original. Once seeded demo content exists, compare card spacing, media size, avatar scale, venue treatment, icon weight and text hierarchy directly against the original recording.
- Do not interpret “empty because there is no seed data” as visual parity. This surface must be re-reviewed with a populated demo account.

### 11.2 Plans

- Original build: Plans contains actual nightlife/event cards. Each card has an EVENT badge, event title, venue, day/time, short detail, friend avatars/count, share action and a large “I’m Down” button.
- Current Swift recording instead shows an Out / TBD / Staying In status strip and “Nobody’s out yet.” Keep the newer Yes/TBD/No status system where required by the previous brief, but do not let it replace the actual Plans/event-card experience.
- Plans should continue to surface real plans/events and “I’m Down” participation in the branded card style. Status controls should be a separate layer, not the entire Plans product.
- The lower-left friends-out/TBD pill shown on the original Plans screen should remain available where it is useful, consistent with Home/Map.

### 11.3 Map shell and controls

- Original build uses a full Spotted map shell: Spotted wordmark + city badge + notification/S branding at the top, search bar (“Search people, venues…”), Friends filter chip, separate filter control, active Out/venue status chip and Stop action.
- Current Swift recording replaces much of this with a vertical stack of floating search/bell/filter/location icons on the right and moves active location/status to a lower pill. Restore the original information hierarchy unless a newer requirement explicitly overrides it.
- Keep people and venues visually distinct. Relationship legend should remain visible and branded; map filters change what the viewer sees, not who can see the viewer.
- Bottom navigation should not cover map content and should preserve the original lightweight map-first feel.

### 11.4 Map people interactions

- Original build: individual friends appear as profile-photo pins with relationship rings; numbered circles are used for true clusters. Current Swift uses generic numbered purple circles for most map activity. Restore people-first pins at normal zoom.
- Tapping a friend cluster/venue grouping in the original can first show a compact “Friends at [Venue]” list with avatars + names. Preserve that intermediate context instead of forcing users directly into a generic list or profile.
- Tapping a person opens the branded friend card over the map. Required content from the original: large avatar, name, shared venue/status, relationship badge/control, mutual/friend context avatars where applicable, overflow menu, large Meet Up CTA and separate Chat action.
- The original friend card itself is not the confetti trigger. Keep the map position behind the card, and return to the same map state on dismissal/back.

### 11.5 Venue detail card

- Original build uses a compact modal card over the map rather than a mostly blank full-screen panel. The card shows venue name, category/neighborhood, any featured/tonight treatment, “who’s here” or “Be the first spotted here tonight” copy, and a strong venue action.
- Restore the prominent “Invite Friends Here” action plus secondary Directions, Share, Save/Bookmark, Yap and expandable More Info controls where applicable.
- Closing the card returns to the same map position. If a venue has friends present, make those people prominent rather than showing empty space.

### 11.6 Invite Friends flow + post-send success

- Original build: “Invite Friends” is a contained modal/card over the map, not an oversized mostly-empty full-screen sheet. It groups people into “Friends Out Now” and “TBD Tonight,” shows avatar + name + current venue/status, allows multi-select, and updates the CTA count (for example “Send Invites (2)”).
- Current Swift recording shows a single sparse row, right-side radio control and large empty area. Restore the denser multi-select social list treatment and the original hierarchy.
- After sending, restore the original “Invites Sent!” success card. The old recording shows a celebratory card with the invited person/venue context plus Undo and Chat actions.
- The confetti belongs to this successful-send state in the supplied original recording. Keep it brief, full of Spotted colors, and do not attach it to the friend-card opening.

### 11.7 Search / discovery

- Original search opens a dedicated branded search experience with a back control, “Search people, venues, or neighborhoods…” field, People / Venues mode controls, Trending Tonight section and a Friends Out Now list.
- Current Swift recording primarily shows a venue-results list while typing. Restore/verify people search, venue search, neighborhood/trending discovery and friend social context rather than reducing search to venue lookup only.
- Search should preserve the old product idea: discovery is about people + nightlife context, not just place autocomplete.

### 11.8 Yap / DMs / conversation styling

- Original Yap is a dense venue-aware list: each post shows the text, venue/neighborhood context, vote count and age. Hot/New switching is compact and the surrounding UI stays lightweight.
- Current Swift has the same broad structure but more empty-space/utility styling. Once seeded, match the original row density, type hierarchy, venue context and engagement treatment. Keep the 5AM reset messaging from this addendum without letting it visually dominate the feed.
- Original tab label is “DMs”; current Swift says “Messages.” This is a real observed difference. Do not change terminology silently — use the approved label after product confirmation.
- Original DM conversation header emphasizes the friend plus their current shared venue/status in lime; current Swift shows the username. When the viewer is allowed to see it, preserve the more useful nightlife context rather than replacing it with a generic handle.
- Original composer uses a camera/media affordance and branded send control. Keep attachment/send controls visually consistent with the original brand treatment while still fixing the keyboard-dismissal bug.

### 11.9 Activity / notification center — verify, do not assume

- The original recording includes an Activity screen reached from the notification area. It contains Friends Planning / Going rows with “Make plans,” Invitations to You with “I’m down!,” and Messages with “View.”
- The Swift recording does not exercise this screen, so this is not yet a confirmed deletion. Verify that the equivalent Activity experience still exists and is reachable from the notification bell.
- If it is missing or materially simplified, restore it before beta because it is the in-app destination for the notification system already marked P0. If it exists, test that each row opens the correct plan/invite/message and that expired nightly items obey the 5AM reset.

### 11.10 Profile

- Both builds show Recent Spots and a nightly visibility/status card, but the original includes a direct “Change venue” path alongside “Change status.” The Swift recording only shows Change status.
- The newer Yes/TBD/No status model in the previous brief takes precedence over old wording, so do not resurrect outdated audience labels (“All Friends” / “Mutual Friends”). Use Close Friends / Friends / Friends + Mutuals consistently.
- Preserve a fast way to change the current venue/check-in from Profile. It can live inside Update status if that is the approved newer flow, but it should not require hunting through multiple screens.
- Current Swift adds profile identity/stats, All Friends and Invite Friends modules that were not shown in the original profile recording. These can remain if approved; the key requirement is that they do not crowd out the nightly status + Recent Spots hierarchy.

### 11.11 Global bottom navigation / brand chrome

- Original build uses a lightweight bottom navigation with Home, Leaderboard, Map, Chat and the branded S as the profile destination. Current Swift uses a large rounded capsule background and a generic Profile icon/label.
- Restore the original navigation personality unless the capsule/profile-icon redesign was explicitly approved. In particular, keep the S as a recognizable branded destination if that is still the intended profile affordance.
- Selected-tab styling should be clear without making the entire navigation feel like a generic iOS pill. Verify spacing so the floating + button and content never collide with the nav.
- Across all screens, keep typography scale, purple/lime balance, icon weight, corner radii and spacing consistent. The old build should be treated as the visual source of truth; newer functional requirements supersede old copy/logic only where explicitly specified.

### 11.12 What is NOT a confirmed regression from the recordings

- City badge content (LA vs NYC) is environment/demo data, not a design bug.
- An empty Swift feed/Yap/Plans screen versus a populated old screen is not by itself proof that the feature is missing. It is proof that we need seeded data before visual QA can be completed.
- Leaderboard is shown in the Swift recording but not meaningfully exercised in the old recording, so do not infer a visual regression from these two videos alone. Use the existing leaderboard requirements from the prior brief.
- Any new status/camera/5AM behavior explicitly approved in the prior brief should remain even if the old prototype behaved differently. The parity goal is to preserve the old product personality and interactions, not roll back newer approved product logic.

## 12  Visual recording references

These snapshots are included so the implementation team can compare the current Swift build and original build without guessing. Left = current Swift recording; right = original build unless otherwise labeled.

![](Spotted_Developer_Addendum_v3_images/image1.jpg)

*Core social surfaces: Home/Newsfeed, Plans, Map and Invite Friends.*

![](Spotted_Developer_Addendum_v3_images/image2.jpg)

*Search, Yap, DM conversation and Profile.*

![](Spotted_Developer_Addendum_v3_images/image3.jpg)

*Original-only reference states: friend card, post-invite confirmation/confetti and Activity screen.*

**For the next TestFlight review, please also reply to Section 11 by item number with:** Matched / Needs work / Not implemented / Intentionally different (with reason). Any “intentionally different” item should be called out before it is treated as final.
