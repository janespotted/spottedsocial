

# Fix: Remove Overlapping X Buttons and Add Tap-Outside-to-Dismiss

## Problem
The OnboardingCarousel and BusinessOnboarding have both a "Skip X" button in the top-right and a "Next" button at the bottom. On smaller screens these can feel redundant or overlap visually. The user also wants to be able to tap outside the content card to dismiss.

## Changes

### 1. `src/components/OnboardingCarousel.tsx`
- **Remove the top-right "Skip X" button entirely** (lines 78-86). The "Next" button at the bottom already handles progression.
- **Add a "Skip" text-only link** below the Next button (subtle, no X icon) for users who want to skip the whole carousel.
- **Add tap-outside-to-close**: Wrap the inner card in a narrower container and attach an `onClick` handler on the backdrop `div` that triggers skip when tapping outside the card content.

### 2. `src/components/business/BusinessOnboarding.tsx`
- **Same treatment**: Remove the top-right "Skip X" button (lines 64-72).
- **Add a "Skip" text link** below the "Next/Get Started" button.
- **Add tap-outside-to-close** on the backdrop area.

## What Stays the Same
- All slide content, progress dots, and Next/Get Started button logic remain untouched.
- FindFriendsOnboarding is not changed (it has a proper "Skip for now" at the bottom, no conflicting X button).
- DailyNudgeModal uses a Dialog which already supports click-outside-to-close.

## Technical Detail

For tap-outside-to-close, the outer `div` gets an `onClick` handler that checks `e.target === e.currentTarget` (only fires when clicking the backdrop, not the card content). This is the same pattern used in `ImDownConfirmation.tsx`.

