

# Add Quick Star Rating to Tonight's Buzz

## Overview
Add a third "Quick Rate" option to the Drop Vibe dialog that lets users rate a venue 1-5 stars with a single tap. This rating is ephemeral (expires at 5am like all buzz content) and provides a fast way for users to indicate venue quality.

---

## Changes Required

### 1. Database Migration
Add a `star_rating` column to `venue_buzz_messages` table:

```sql
ALTER TABLE venue_buzz_messages 
ADD COLUMN star_rating smallint CHECK (star_rating >= 1 AND star_rating <= 5);
```

This makes `text` no longer strictly required when a star rating is present (will handle in code by inserting empty string or special marker).

Also need to update the table to allow empty text when star_rating is provided:
```sql
-- Make text nullable or allow empty string for rating-only submissions
ALTER TABLE venue_buzz_messages 
ALTER COLUMN text DROP NOT NULL;
```

---

### 2. Update DropVibeDialog Component

**File: `src/components/DropVibeDialog.tsx`**

Add a third view mode and star rating functionality:

- Update `ViewMode` type to include `'rate'`
- Add `selectedRating` state (1-5)
- Add `rateAnonymous` state (default true, like Quick Vibe)
- Add third button on selection screen with Star icon
- Create "Quick Rate" view with 5 tappable stars
- Add submit handler for rating-only buzz

**UI Design for Quick Rate view:**
```
┌─────────────────────────────────────┐
│  ← Quick Rate                       │
├─────────────────────────────────────┤
│  How would you rate it tonight?     │
│                                     │
│     ☆   ☆   ☆   ☆   ☆             │
│    (tap to select 1-5 stars)        │
│                                     │
│  [x] Post anonymously               │
│                                     │
│  [Cancel]        [Rate ★]           │
│                                     │
│       Expires at 5am ✨              │
└─────────────────────────────────────┘
```

**Selection screen update (3 columns):**
```
┌─────────────────────────────────────┐
│  Add to Tonight's Buzz              │
├─────────────────────────────────────┤
│ Everyone at [Venue] can see this    │
│                                     │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ 📷      │ │ 💬      │ │ ⭐      │ │
│ │ Share a │ │ Quick   │ │ Quick   │ │
│ │ Clip    │ │ Vibe    │ │ Rate    │ │
│ │photo/vid│ │text msg │ │ 1-5 ★   │ │
│ └─────────┘ └─────────┘ └─────────┘ │
└─────────────────────────────────────┘
```

---

### 3. Update BuzzItem Component

**File: `src/components/BuzzItem.tsx`**

- Add `star_rating` to the `TextBuzzItem` interface (or create new `RatingBuzzItem` type)
- Render star display when `star_rating` is present
- Show filled stars (★) for the rating value

**Display examples:**
- Rating only: `★★★★☆ • Anonymous • 2h ago`
- Rating + text: `★★★★★ "Great DJ tonight!" • John • 1h ago`

---

### 4. Update VenueIdCard Fetching

**File: `src/components/VenueIdCard.tsx`**

- Update `fetchBuzzItems` to include `star_rating` in the select query
- Update `BuzzItemData` interface to include `star_rating`

---

## Technical Details

### Database Schema Change
| Column | Type | Nullable | Check |
|--------|------|----------|-------|
| star_rating | smallint | YES | 1-5 |
| text | text | YES (was NOT NULL) | - |

### New State in DropVibeDialog
```typescript
const [selectedRating, setSelectedRating] = useState<number>(0);
const [rateAnonymous, setRateAnonymous] = useState(true);
```

### Star Rating Component (inline)
```typescript
// Render 5 stars, filled up to selectedRating
{[1, 2, 3, 4, 5].map((star) => (
  <button
    key={star}
    onClick={() => setSelectedRating(star)}
    className={`text-3xl transition-all ${
      star <= selectedRating ? 'text-yellow-400' : 'text-white/30'
    }`}
  >
    ★
  </button>
))}
```

### Submit Handler for Rating
```typescript
const handleSubmitRating = async () => {
  if (selectedRating === 0 || !user) return;

  setUploading(true);
  try {
    const { error } = await supabase
      .from('venue_buzz_messages')
      .insert({
        user_id: user.id,
        venue_id: venueId,
        venue_name: venueName,
        text: '', // Empty for rating-only
        star_rating: selectedRating,
        is_anonymous: rateAnonymous,
        expires_at: calculateExpiryTime(),
      });

    if (error) throw error;

    haptic.success();
    toast.success('Rating added to Tonight\'s Buzz! ⭐');
    onVibeSubmitted?.();
    handleClose();
  } catch (error) {
    console.error('Error posting rating:', error);
    toast.error('Failed to submit rating');
  } finally {
    setUploading(false);
  }
};
```

---

## Files Modified

| File | Change |
|------|--------|
| Database | Add `star_rating` column, make `text` nullable |
| `src/components/DropVibeDialog.tsx` | Add Quick Rate view mode and submission |
| `src/components/BuzzItem.tsx` | Display star ratings |
| `src/components/VenueIdCard.tsx` | Fetch star_rating in query, update types |

