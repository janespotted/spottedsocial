
# Fix Missing Photos on Venue ID Cards

## Problem
Venue ID cards are missing pictures because:
1. **Early return on error** - When the edge function returns an error, the code returns early and never attempts to set photos (even from cached database data)
2. **Authentication required** - The `get-venue-hours` edge function requires authentication, so unauthenticated users see no photos
3. **Inconsistent response handling** - The API response structure isn't being safely extracted

## Solution
Implement two fixes:

1. **Fallback to database-cached photos** when the edge function fails
2. **Add safe response extraction** to handle API response variations

---

## Technical Changes

### File: `src/components/VenueIdCard.tsx`

**1. Modify `fetchVenueHours` to not early-return on error (lines 120-166)**

Instead of returning early on error, continue to attempt using any cached data:

```typescript
const fetchVenueHours = async () => {
  if (!selectedVenueId) return;

  setLoadingHours(true);
  try {
    const { data, error } = await supabase.functions.invoke('get-venue-hours', {
      body: { venueId: selectedVenueId }
    });

    if (error) {
      console.error('Error fetching venue hours:', error);
      // Don't return early - try to load cached data from database
      await fetchCachedVenuePhotos();
      return;
    }

    // Safe extraction of response data
    if (data?.operating_hours) {
      const hoursDisplay = getHoursDisplayString(data.operating_hours as VenueHours);
      setVenueHours(hoursDisplay);
    } else {
      setVenueHours(null);
    }

    // Set Google data with safe extraction
    const photos = extractArraySafe(data, 'google_photo_refs');
    setGooglePhotos(photos);

    if (data?.google_rating) {
      setGoogleRating(data.google_rating);
    } else {
      setGoogleRating(null);
    }

    if (data?.google_user_ratings_total) {
      setGoogleRatingsCount(data.google_user_ratings_total);
    } else {
      setGoogleRatingsCount(0);
    }
  } catch (error) {
    console.error('Error fetching venue hours:', error);
    // Fallback to cached data
    await fetchCachedVenuePhotos();
  } finally {
    setLoadingHours(false);
  }
};
```

**2. Add fallback function to fetch cached photos from venues table (new function)**

```typescript
const fetchCachedVenuePhotos = async () => {
  if (!selectedVenueId) return;
  
  try {
    const { data: venueData } = await supabase
      .from('venues')
      .select('google_photo_refs, google_rating, google_user_ratings_total, operating_hours')
      .eq('id', selectedVenueId)
      .single();
    
    if (venueData) {
      // Set cached photos if available
      if (venueData.google_photo_refs && Array.isArray(venueData.google_photo_refs)) {
        setGooglePhotos(venueData.google_photo_refs);
      }
      
      if (venueData.google_rating) {
        setGoogleRating(venueData.google_rating);
      }
      
      if (venueData.google_user_ratings_total) {
        setGoogleRatingsCount(venueData.google_user_ratings_total);
      }
      
      if (venueData.operating_hours) {
        const hoursDisplay = getHoursDisplayString(venueData.operating_hours as VenueHours);
        setVenueHours(hoursDisplay);
      }
    }
  } catch (err) {
    console.error('Error fetching cached venue photos:', err);
  }
};
```

**3. Add safe array extraction helper (near top of component)**

```typescript
// Safe extraction helper for API responses
const extractArraySafe = (response: unknown, key: string): string[] => {
  if (!response || typeof response !== 'object') return [];
  const r = response as Record<string, unknown>;
  const value = r[key];
  if (Array.isArray(value)) return value;
  return [];
};
```

---

## Flow After Fix

```text
User opens Venue ID Card
        |
        v
fetchVenueHours() called
        |
        v
Edge function succeeds? ----Yes----> Set photos from response
        |
        No (auth error, etc.)
        |
        v
fetchCachedVenuePhotos() called
        |
        v
Load photos from venues table
        |
        v
Photos display (if cached)
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/VenueIdCard.tsx` | Add fallback to cached photos, safe extraction helper |
