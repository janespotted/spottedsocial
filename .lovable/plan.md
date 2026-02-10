

# Add "Add to Home Screen" Slide to Onboarding Carousel

## What Changes

Add a 5th slide to the existing onboarding carousel (before the Find Friends step) that prompts new users to add the app to their home screen. No other slides or logic will be touched.

## Technical Details

### File: `src/components/OnboardingCarousel.tsx`

Add one new slide object to the `slides` array (inserted as the last item, index 4):

```typescript
{
  icon: Smartphone, // from lucide-react
  title: 'Add Spotted to Home Screen',
  description: 'For the best experience, add Spotted to your home screen. Tap the share icon in your browser, then "Add to Home Screen".',
  color: '#d4ff00',
}
```

Additional changes in the same file:
- Import `Smartphone` from `lucide-react`
- No other logic changes -- the existing Next/Skip/Find Friends flow handles the new slide automatically since it's array-driven

That's it. One import added, one object added to the array. Everything else (navigation, dots, skip, Find Friends step) works as-is.

