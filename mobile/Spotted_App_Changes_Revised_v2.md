# Spotted App Flow and Interface Changes

*Developer review and implementation requests*

I went through the app again and pulled together the changes I want to make. The main thing is making the flows feel intuitive: opening the app, setting your status, finding friends and posting something should all be quick and obvious.

Some of these are things visible in the recording; others are behaviors I want you to verify.

## 1. Required opening status prompt

When someone opens the app and hasn't answered for that night, show "Are you out tonight?" with three buttons: Yes, TBD, No.

Present this required prompt as a bottom sheet that slides up from the bottom of the screen, matching the interaction pattern from the original app. It should feel like a native slide-up pop-up rather than a centered alert or a full-screen takeover. Once it has slid up, it remains modal and cannot be dismissed until the user selects Yes, TBD or No.

They must answer before they can use the app. The pop-up should stay on screen until they select one of those three options.

- No close button, Skip or "Remind me later."
- Swiping down, tapping outside the pop-up or pressing Back should not dismiss it.
- The screens and navigation underneath should not be usable while the question is unanswered.
- Closing and reopening the app should bring the question back if they still haven't answered.
- Opening the app through a notification or link should not bypass the question.
- No is a valid answer that lets them enter the app without sharing their location. Requiring an answer should not mean requiring location permission.

After they answer, follow the relevant flow:

### Yes

- Make the default Yes path extremely fast. After they tap Yes, show one confirmation sheet centered on the best venue guess: "Looks like you're at [Venue]?" The happy path should require only one more tap to share.
- Use "Share my spot" as the primary action and "Not here" as the secondary action. Show the audience as one compact row such as "Visible to Friends ▾" rather than forcing a separate audience decision.
- For a new user, default status visibility to Friends. If they explicitly change the audience, remember that choice for later status updates and never silently broaden a narrower selection.
- Only share their location after the final "Share my spot" action. Tapping Yes alone must not mark them checked in, request unnecessary background permissions or start sharing.
- After a successful share, dismiss the setup directly into the useful part of the app and clearly show the active check-in. When possible, give an immediate payoff such as "You're out. 4 friends are nearby."
- Do not show the full nearby-venue list on the default confirmation screen. Only if they tap "Not here" should the sheet expand to nearby venues, Private Party and a search/manual-entry option.
- Treat Private Party as a location type within the Yes flow, not as a fourth status alongside Yes/TBD/No.

### TBD

- Keep TBD lightweight: show "Thinking about going out?" with a compact "Visible to Friends ▾" control and a "Share TBD status" action.
- TBD should not require a venue or location permission. Tapping the compact visibility control opens the same audience selector described below.
- After sharing, let them enter the app and surface useful social proof such as "3 friends are out tonight" or "See who's going out." This should help convert TBD users to Yes once their friends become active.

### No

- Save that they're not out tonight and let them continue into the app immediately.
- Don't request a venue or location permission, but don't make the app useless. They should still be able to browse venue activity, the feed/Yap and friends' shared Out/TBD statuses. Gate precise live venue/map pins until they update their status, and use aggregate cues plus a CTA such as "Going out after all? Update status to see who's where."

Let users go back within the Yes/TBD setup to change their answer. Don't trap them if they selected the wrong option or declined a permission.

Once someone has answered—including TBD or No—don't repeat the question every time they reopen the app that night. They should still be able to change their answer through Update status.

Please use one consistent definition of "tonight" across this prompt, statuses, live check-ins and post expiration, and confirm the reset time/time zone. Statuses and check-ins should expire automatically at that reset so nobody looks live the next morning.

## 2. Audience selection and status controls

The final audience names should be Close Friends, Friends, Friends + Mutuals, in that order.

| Audience label | Description underneath |
|---|---|
| Close Friends | Only friends on your Close Friends list. |
| Friends | All your friends on Spotted, including Close Friends. |
| Friends + Mutuals | Your friends and people you share a friend with on Spotted. |

These are progressively broader audiences. Friends includes Close Friends, and Friends + Mutuals includes all direct friends plus mutuals.

Use "Friends" as the middle label, not "All Friends." Use "Friends + Mutuals" as the third label, not "Mutual Friends," because direct friends are included in that audience too.

### Audience selector

- Do not force this selector open during the normal Yes/TBD happy path. Show a compact control such as "Visible to Friends ▾"; tapping it opens a bottom sheet titled "Who can see this?"
- In the bottom sheet, show three stacked, selectable rows with the labels and descriptions above.
- Allow one selection at a time, with a clear checkmark on the selected row.
- Include a "Confirm audience" button. Confirming the audience should return to the status/post setup; it must not publish anything by itself.
- On the main screen and setup sheets, keep the chosen audience visible in that compact dropdown row so users can understand and change it without adding another mandatory step.
- Replace the cramped side-by-side audience buttons with this presentation. The main flow should feel like a quick check-in, not a privacy-settings form.
- Use the same names, definitions and selection pattern for check-ins, TBD statuses and posts, but keep post audience preferences separate from live-status preferences.
- If the selected audience has nobody in it, tell the user.
- For new users, use Friends as the default live-status audience. If they explicitly choose Close Friends or Friends + Mutuals, retain that explicit status preference for future updates; never silently broaden it.

### Status controls

- The current "Go Live" menu includes I'm Out, Planning Tonight, Private Party and Staying In. Replace it with the Yes/TBD/No status model above. "Go Live" sounds like livestreaming, and Private Party is a location type rather than a status.
- Use "Update status" for reopening the Yes/TBD/No flow.
- Use "Share my spot" for the final confirmation of a venue check-in and "Share TBD status" for the final confirmation of TBD.
- Confirming an audience during setup should return to that setup; it shouldn't publish the check-in or TBD status before the final sharing action.
- Changing status from Plans, Profile or Map should follow the same rules and stay synchronized across those screens.
- Keep the status card simple and scannable: for example, "OUT TONIGHT" / "Dudley Market" / "Visible to Friends," with separate Update and Stop sharing actions. It should clearly state the current status, venue if applicable and selected audience without making the user manage the system from their profile.
- Also, "Stop sharing" is different from "No." Someone might still be out but want to become invisible. Keep those actions separate.
- For Private Party, clearly explain what location detail is shared. The existing copy promises the exact spot is for Close Friends only, so the actual behavior needs to honor that. Don't create a publicly discoverable venue or expose a private address to a wider audience.
- A live status/check-in should automatically end at the same nightly reset time used elsewhere in the product. If posts currently disappear at 5am, either use 5am local time consistently for all "tonight" behavior or change every reference together.

## 3. Location permissions

In the recording, checking in triggers Motion & Fitness access, then a background-location warning that sends me into Settings. My profile already says I'm out during that sequence.

- Briefly explain why permissions are needed before requesting them.
- Do not show the user as Out or checked in merely because they tapped Yes. Publish the active status only after "Share my spot" succeeds.
- Distinguish a successful venue check-in from background location updates being enabled.
- If a manual check-in has worked, don't make the whole action look unsuccessful.
- If the venue check-in succeeds but background updating is unavailable, say that clearly: the check-in is active, but automatic movement/location updates are limited. Do not treat that as a failed check-in.
- When I return from Settings, recheck permissions and update the screen automatically.
- If I decline a permission, explain what still works and give me a usable next step.
- If location is unavailable, offer venue search/manual selection instead of leaving me on a spinner.
- Please test leaving a venue, backgrounding the app, losing connection and stopping sharing. An old check-in shouldn't continue looking freshly updated indefinitely.

## 4. Camera and capture flow

Right now, tapping the posting "+" opens a form with Camera/Library choices and a caption field before you've selected anything. I want:

Camera → capture/select media → preview and optional caption → share.

The camera should be built into Spotted and match the app (like Snapchat):

- Open straight into a full-screen camera preview.
- Tap the capture button for a photo.
- Hold the capture button to record video; release to stop.
- Show a recording indicator and timer. If there's a maximum duration, make that clear.
- Double-tap the camera preview to switch between front and rear cameras, like Snapchat.
- Also include a visible flip-camera button.
- Put a small square library thumbnail in the bottom-left corner for selecting an existing photo or video.
- Include flash control and a clear close button.
- Keep caption, venue and audience fields off the initial camera screen.

Please confirm whether switching cameras during recording can work smoothly. If that's a larger task, prioritize double-tap switching before capture first.

If camera access is declined, the library option should still work. If microphone access is declined, explain the effect on video without blocking photo posting.

## 5. Post preview and sharing

After capturing or selecting media:

- Show a large preview and allow video playback.
- Add the optional caption here.
- Make Retake/Replace easy to find.
- Suggest the current checked-in venue, but let users change or remove the post's venue.
- Make clear that changing a post's venue does not silently move their live check-in.
- Show the selected audience before Share using Close Friends, Friends or Friends + Mutuals, with the audience selector described above.
- Remember their last explicitly selected post audience and don't automatically broaden it.
- Preserve the caption and choices if they go back to replace the media.
- If they close a populated draft, ask before discarding. Don't ask when nothing has been created.
- Show upload progress and prevent repeated taps from creating duplicate posts.
- Preserve the draft on failure and offer Retry.
- After success, show the published post with clear confirmation.
- The existing "Posts disappear at 5am" note is easy to miss. Make that rule readable on the preview screen.

## 6. Button labels and behavior

A few specific controls stood out:

- **Plans "+":** In the recording this opens the photo-post form. A Plans action should clearly create a plan; a camera action should open the camera. Don't use an ambiguous "+" for both without labeling the purpose.
- **Messages "+" and "New Chat":** These should open the same friend-selection flow. Make the purpose clear with a compose icon or label.
- **Profile "Share":** Rename it "Share profile" so it isn't confused with posting or location sharing.
- **Profile "Edit":** Rename it "Edit profile."
- **Map "Stop":** Rename it "Stop sharing" and make the tap area comfortably usable. It's currently tiny inside the venue pill.
- **Map location arrow:** It should clearly recenter on me. Confirm it doesn't unexpectedly change zoom or selected filters.
- **Map filter icon:** Show when a filter is active and make resetting filters easy.
- **Notification bell:** The bright purple fill makes it look permanently selected. Make the styling distinguish an ordinary button, an active screen and unread notifications.
- **S logo in the header:** If it's decorative, don't make it appear interactive. If it performs an action, make that purpose discoverable.
- Selected options, ordinary buttons and disabled controls should look consistently different across the app.

## 7. Map and venue screens

The current map filter mixes people and places: "Everyone" includes friends and venues, while "Friends Only" means hiding venue pins.

Separate:

- Which people I see.
- Whether venues are shown.
- Which venue types are shown.

For a people filter that progressively expands who is displayed, use Close Friends, Friends, Friends + Mutuals with the same group definitions above. Keep "Show venues" as a separate control.

Make clear that these filters change what I see, not who can see me. Changing a map filter must not change my sharing audience.

For an individual person's relationship badge or the map legend, Close Friend, Friend and Mutual are appropriate. Those describe a person's relationship to me; Friends + Mutuals describes a combined audience or viewing selection.

### Venue details

- Use a compact, expandable sheet when there isn't much content. Electric Bleu opens a nearly full-screen panel with a large blank area.
- When friends are there, make who's there prominent.
- Let users close or swipe down and return to the same map position.
- Give the bookmark button an obvious saved/unsaved state.
- Confirm Directions, Share and More Info work as expected.
- Keep the panel dismissible while loading, and show Retry if loading fails.

## 8. Empty screens and status copy

In the recording I'm marked Out, but Plans says "Nobody's out yet" and tells me to update my status.

Handle these situations separately:

- **No friends:** "Add friends to see who's out," with an Add Friends button.
- **Friends, but nobody sharing:** "None of your friends are sharing their spot yet."
- **No posts:** Explain that there aren't posts from their circle yet and offer a clear posting action.
- **No messages and no friends:** Offer Add Friends rather than only New Chat.
- **No results because of filters:** Offer Clear Filters.
- **Loading or an error:** Don't present it as an empty social feed.

If the user is already Out or TBD, acknowledge that instead of telling them to set a status again.

If the user selected No, keep browsing useful but do not expose precise live friend venues/map pins. Show aggregate or less precise activity cues and a clear "Going out after all? Update status" path.

If the user is TBD, actively surface when friends become Out so the app helps move them from considering a night out to joining one.

Finding friends is particularly important for a new account. Keep Find Friends and Invite Friends easy to reach, including when contacts access is declined. Please also verify how users add/remove someone from Close Friends; that audience choice needs an obvious way to manage its members.

## 9. Leaderboard and layout refinements

- The leaderboard's Biggest Mover card overlays venue rows. Reposition it or adjust the layout so it doesn't obscure the list.
- Ensure the floating bottom navigation doesn't prevent users from fully seeing or tapping the last item on any screen.
- Make leaderboard rows clearly tappable and have them open the relevant venue.
- Fix "1 spots" to "1 spot."
- Increase contrast for supporting text, map labels and unselected controls.
- Make bottom sheets sufficiently opaque. The underlying lime glow shows through near "Somewhere else."
- Check text and buttons at larger phone text sizes.
- Make header branding readable and consistent with the approved Spotted branding.

## 10. Comment composer

Right now, adding a comment takes over the whole screen. I want it to work like Instagram: the post stays in place and shifts up while a partial sheet slides in from the bottom with the comments and input field.

- Open the comment composer as a bottom sheet over the current screen, not a full-screen takeover.
- Keep the post visible above the sheet, shifting it up as needed rather than replacing it.
- Dock the input field just above the keyboard, with existing comments scrollable within the sheet.
- Let users swipe down or tap outside to dismiss and return to the post in the same position.

## 11. Morning After Debrief

The morning after someone was out, give them a personalized recap of their own night. This should feel like a private "your night last night" summary—not a generic feed and not a public leaderboard.

### Trigger and presentation

- Surface the debrief the next morning after the nightly reset, either as a prominent card when they reopen Spotted and/or a notification that brings them into the recap.
- Only create a debrief when there is enough activity to make it useful. If they barely used the app or did not go out, do not force an empty recap.
- The recap should be generated only for that user and should not automatically post anywhere. It is a personal summary of their night.

### What the debrief should include

- **Who you crossed paths with last night:** show friends and mutuals who were at the same venue during an overlapping time window. Make it clear this means your nights overlapped at the same place, not necessarily that the two people physically saw each other.
- **Where you went:** show the user's own venue sequence from the night, in order, with simple time context where available. Private Party should remain privacy-safe and should never expose a private address in the recap.
- **Your pictures from the night:** collect the photos/videos the user posted or captured through Spotted that night into the recap so it feels like a mini memory of the night.
- **Your Yaps:** include the Yaps the user posted that night, with their original time/venue context where relevant.
- A short personalized night summary generated from that user's activity—for example number of places visited, how many friends/mutuals they overlapped with, their most social stop, first/last stop, or another genuinely interesting fact from the night. Keep this specific to that person rather than giving everyone the same template copy.
- Optional "fun facts" should only use activity the app actually has. Do not invent inferred encounters, precise paths or behavior that the product did not record.

### Privacy and product behavior

- Respect the same relationship and privacy rules used elsewhere in Spotted. A morning recap should not become a back door for revealing someone's hidden location, a private-party address or activity the user was not allowed to see.
- For mutuals, only surface a crossed-path result when the app's mutual visibility rules permit that connection to be disclosed.
- If exact time overlap is uncertain, use softer language such as "You were both at [Venue] last night" rather than implying a confirmed face-to-face encounter.
- Keep the recap visually fun and concise: more like a personalized story/memory than an analytics dashboard. The goal is to make opening Spotted the morning after feel rewarding and give users another reason to come back.

## 12. Verification before completion

Please test:

- Opening with no status and confirming the app cannot be used until Yes/TBD/No is answered.
- Try to dismiss the prompt via swipe, outside tap, Back, reopening and notification links; none should bypass it.
- Choosing each answer, changing an answer, reopening after answering and the next-night reset.
- Confirm No enters without location access and Yes alone does not start sharing.
- Confirm the happy path is Yes → Share my spot; "Not here" should reveal nearby venues, Private Party and search.
- Confirm No keeps browsing useful but hides precise live friend venue/map locations until status changes.
- TBD visibility for Close Friends, Friends and Friends + Mutuals, then switching to Yes or No.
- Confirm Friends includes Close Friends, and Friends + Mutuals includes all direct friends plus mutuals.
- Verify visibility with a Close Friend, direct friend, mutual and out-of-audience account.
- Venue confirmation, Private Party, permission denial and returning from Settings.
- Taking a photo, holding for video, double-tapping to flip, library selection, retaking and canceling.
- Posting successfully, failed upload/retry and repeated Share taps.
- Switch tabs and return from venue details without losing screen state.
- Verify cross-account privacy for audience changes, stop sharing, remove/block and resulting visibility.
- Confirm map viewing filters do not change sharing permissions.
- Confirm the required opening status prompt slides up from the bottom like the original app, stays modal, and cannot be dismissed without selecting Yes, TBD or No.
- Test the Morning After Debrief with different nights: multiple venues, one venue, friends and mutuals with overlapping venue/time windows, no overlaps, posts/Yaps present, and minimal activity.
- Verify the debrief never exposes a private-party address or another user's hidden activity, and that crossed-path language only claims what the available location/time data actually supports.

---

My priorities: restore the status flow, make Yes → Share my spot a two-tap default, make camera/posting feel natural, and keep sharing controls unambiguous. The core loop is status → location → people. After those core flows are working cleanly, build the Morning After Debrief as a retention loop that gives each user a personalized reason to reopen Spotted the next day.

Please reply by section with what works, what needs changing, any questions and the estimate. For anything marked "verify," test it and report the result rather than treating it as a confirmed bug.
