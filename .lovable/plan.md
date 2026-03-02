

## Fix: Remove Black Background from Spotted S Logo

### Problem
The previous compression of `spotted-s-logo.png` stripped its alpha channel (transparency), giving it a black background. This is visible in the top-right header icon and the bottom nav across all pages.

### Solution
Apply `mix-blend-mode: screen` via CSS to all `<img>` tags that render the logo. The `screen` blend mode makes black pixels fully transparent against any background, perfectly restoring the original look without needing to re-export the image.

### Changes

**Every file that renders the logo** (18 files total) — add `mix-blend-mode: screen` to the `<img>` className. However, to avoid touching 18 files, the cleaner approach is:

**`src/index.css`** — Add a single utility class:
```css
.logo-blend {
  mix-blend-mode: screen;
}
```

Then add `logo-blend` to every `<img src={spottedLogo}>` className across these files:
- `src/pages/Home.tsx`
- `src/pages/Profile.tsx`
- `src/pages/Feed.tsx`
- `src/pages/Map.tsx`
- `src/pages/Leaderboard.tsx`
- `src/pages/Messages.tsx`
- `src/pages/Thread.tsx`
- `src/pages/Friends.tsx`
- `src/pages/Auth.tsx`
- `src/pages/business/BusinessLanding.tsx`
- `src/pages/business/BusinessAuth.tsx`
- `src/components/BottomNav.tsx`
- `src/components/SplashScreen.tsx`
- `src/components/CheckInModal.tsx`
- `src/components/CheckInConfirmation.tsx`
- `src/components/MeetUpConfirmation.tsx`
- `src/components/ImDownConfirmation.tsx`
- `src/components/VenueInviteConfirmation.tsx`

**Alternative (fewer edits):** Instead of a utility class, use a global CSS rule targeting all images with that src. But since Vite hashes asset URLs, the utility class approach is more reliable.

### Files changed
- `src/index.css` — add `.logo-blend` utility
- All 18 files above — add `logo-blend` to the logo `<img>` className

