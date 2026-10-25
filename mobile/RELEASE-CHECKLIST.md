# Release Checklist — Spotted iOS (React Native)

Feature work is complete (all five tabs, check-in + venue engine, Yap, DMs,
private parties, invites/QR). What remains is release infrastructure.

## Needed from the client (Jane)

Copy/paste this section when asking:

1. **Apple Developer account access** (or added as Admin/App Manager):
   - To create the App Store listing for `com.janereynolds.spotted`
   - To generate an **APNs key** (Keys → new key with Apple Push Notifications
     enabled, download the `.p8` + note the Key ID and Team ID) — push
     notifications in TestFlight/production don't work without it. The `.p8`
     also needs to be configured in the Supabase `send-push` edge function's
     secrets.
2. **Transistorsoft background-geolocation license — purchased October 11, 2026.**
   Order #17585 is registered to `janespotted`; paid iOS and Android keys were
   generated for `com.janereynolds.spotted`. The license is perpetual; the
   customer dashboard lists the included update/support period through October 10, 2027.
   `app.config.js` reads `TRANSISTORSOFT_IOS_LICENSE` and
   `TRANSISTORSOFT_ANDROID_LICENSE`, or the gitignored
   `transistorsoft.licenses.local.json` (`ios` and `android` properties).
   Obtain keys from the [customer dashboard](https://www.transistorsoft.com/shop/customers).
   Do not commit them: this repository is public. Production/preview config
   fails if a required key is missing. For a single-platform local release,
   set `SPOTTED_BUILD_PLATFORM=ios` or `android` (EAS supplies `EAS_BUILD_PLATFORM`).
   After changing a key, regenerate the native project and rebuild; an OTA
   JavaScript update cannot replace the native license. Verify the resulting
   Release build on a real phone before treating release licensing as tested.
3. **Twilio account** — the account behind phone-number login is suspended
   (error 20003). Either reactivate it (billing) or confirm we launch with
   email/password sign-in only.
   **If reactivating, read `supabase/SMS-OTP-COST-AND-FRAUD.md` first** — it
   covers A2P 10DLC registration (days of lead time, gates US delivery),
   provider choice (Messaging ≈$0.013/code, not Verify ≈$0.05), and the
   SMS-pumping controls to set before real SMS goes live. Test OTPs are
   currently what makes this safe; that ends the moment a provider is wired in.
4. **App Store assets** — app name ("Spotted"?), subtitle, description,
   keywords, support URL/email, privacy policy URL (the in-app one exists),
   and marketing screenshots preference (we can generate from the simulator).
5. **Expo account** (optional) — if she wants builds under her org, an Expo
   account email to own the EAS project; otherwise builds run under the dev's
   account and can transfer later.
6. ~~**Enable Supabase Realtime on the database tables**~~ — **DONE Sept 14**
   (client gained dashboard access; publication populated via ALTER, delivery
   verified with an authenticated probe). Original finding kept for the
   record: verified Sept 12
   that NO postgres_changes events are delivered for ANY table (tested with
   a direct authenticated client, outside the app). The `supabase_realtime`
   publication has no tables, so every "live update" feature (feed, map pins,
   leaderboard, DMs, typing, notifications) silently falls back to
   pull-to-refresh/polling — on web AND mobile, and likely always has.
   In the dashboard: Database → Publications → `supabase_realtime`, enable
   for: `posts`, `night_statuses`, `checkins`, `dm_messages`,
   `dm_read_receipts`, `dm_typing_indicators`, `notifications`, `plans`,
   `plan_downs`, `yap_messages`. Or SQL:
   `ALTER PUBLICATION supabase_realtime ADD TABLE posts, night_statuses, checkins, dm_messages, dm_read_receipts, dm_typing_indicators, notifications, plans, plan_downs, yap_messages;`
   No app change needed — the clients are already subscribed and will start
   receiving events the moment this is flipped.

## Doable now without the client

- [ ] Native rebuild for `expo-contacts`:
      `cd mobile && npx expo prebuild -p ios && npx expo run:ios`
- [ ] `eas.json` scaffold (development / preview / production profiles)
- [ ] `eas init` + first internal build (needs any Expo account)
- [ ] Simulator screenshot set for App Store listing drafts

## Review notes for App Store submission

- **Review sign-in (phone OTP, no SMS sent):** phone `+1 555 000 0001`,
  verification code `123456` (Supabase test numbers ...0001–0007 all use
  this code — verified working on prod Sept 14). The auth screen is
  phone-only; the old email demo account
  (engineernadeemkhan120@gmail.com / SpottedDev2026!) still exists but its
  sign-in path is hidden from the UI.
- Location usage: check-in venue detection + friend map while "out" only;
  tracking stops on force-quit (stopOnTerminate) and never starts on boot.
  See mobile/LOCATION.md for the full privacy model.
- Push: APNs direct via Supabase edge function (`send-push`).
