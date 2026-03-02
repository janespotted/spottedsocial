

## Investigation Results

### Pending Friend Request — Not a Bug
The account you logged into (`jane@superbloompartners.com`, username `user_e4c24f21`) was actually **created on February 10, 2026** — it's not a brand new account. On that same day, a pending friend request was sent from this account to `janerey`. That's why you're seeing the pending status. This is correct behavior.

### Missing Onboarding — Not a Bug Either
The profile already has `has_onboarded: true` set in the database, so the onboarding carousel correctly does not appear. It was likely completed or auto-set during a previous session.

---

## Plan: Add "Replay Onboarding" Option to Settings

To let you (and any user) review the onboarding flow on demand, I'll add a button to the Settings page.

### Changes in `src/pages/Settings.tsx`
- Add a **"Replay Onboarding"** row in the settings list (near the Help/About section)
- On tap, it sets `has_onboarded = false` on the user's profile, then navigates to `/` where `Layout` will detect the flag and show the `OnboardingCarousel`

### No other files need changes
The existing `useOnboarding` hook in `Layout` already checks `has_onboarded` and shows the carousel when it's `false`.

### If you want to test with a truly new account
You'd need to sign up with a different email address. The `jane@superbloompartners.com` account already exists and has data.

