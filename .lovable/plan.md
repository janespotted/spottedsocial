

# Fix Yap Preview Tap on Venue Cards

## Problem
The Yap preview row on the venue card is already a `<button>` with an `onClick` handler and navigation logic (line 827-828), but tapping it doesn't work reliably. Two issues:

1. **Venue card stays open over the Messages page**: The `onClick` calls `navigate()` but never calls `closeVenueCard()`. The venue card overlay (z-300 backdrop + card) remains rendered on top of the Messages page, making it appear like nothing happened.

2. **No active/press feedback**: The button has `hover:bg-white/5` which works on desktop but provides no visible touch feedback on mobile.

## Changes — `src/components/VenueIdCard.tsx` only

### 1. Close venue card before navigating (line 828)
Update the Yap button's `onClick` to:
- Call `closeVenueCard()` first to dismiss the venue card overlay
- Then call `navigate('/messages', { state: { activeTab: 'yap', venueName: venue.name } })`

### 2. Add active press state (line 829)
Add `active:bg-white/10` to the button's className for visible mobile touch feedback.

### 3. Make chevron more visible (line 842)
Change the `ChevronRight` color from `text-white/30` to `text-white/50` so it's clearly visible as a navigation indicator.

These are minimal, surgical changes — just 3 lines modified.

