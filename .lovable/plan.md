

# Include Tonight's Buzz Media in Venue Photo Carousel

## Current Behavior
- The venue photo carousel at the top only shows **Google Place photos** (fetched from the `google_photo_refs` field)
- Tonight's Buzz media clips (user-uploaded photos/videos) are displayed separately as `BuzzItem` cards in the "Tonight's Buzz" section below

## Proposed Enhancement
Merge Tonight's Buzz image/video clips into the carousel so users see both:
1. Google Place photos (professional/official venue photos)
2. Tonight's Buzz media (real-time user-generated content from tonight)

This creates a more dynamic carousel that shows "what's happening now" alongside standard venue photos.

---

## Implementation Approach

### Data Flow
The `mediaClips` data is already being fetched in `fetchBuzzItems()` - we just need to extract the image URLs and combine them with `googlePhotos` for the carousel.

### Changes Required

**File: `src/components/VenueIdCard.tsx`**

1. **Add state for buzz media photos**
   ```typescript
   const [buzzMediaPhotos, setBuzzMediaPhotos] = useState<string[]>([]);
   ```

2. **Update `fetchBuzzItems` to extract image URLs**
   After fetching `mediaClips`, extract image URLs and store them:
   ```typescript
   // Extract image URLs from buzz media clips for carousel
   const buzzImageUrls = (mediaClips || [])
     .filter(c => c.media_type === 'image' && c.media_url)
     .map(c => c.media_url);
   setBuzzMediaPhotos(buzzImageUrls);
   ```

3. **Combine photos for carousel**
   Create a combined photos array that shows buzz photos first (more recent/relevant), then Google photos:
   ```typescript
   const allCarouselPhotos = [...buzzMediaPhotos, ...googlePhotos];
   ```

4. **Update carousel rendering**
   - Replace `googlePhotos` with `allCarouselPhotos` in the carousel
   - Optionally add a small badge/indicator on buzz photos to show they're from tonight
   - Handle the empty state when neither exists

---

## Visual Design

### Carousel with mixed content:
```text
┌─────────────────────────────────────┐
│ [Tonight's Buzz Photo 1]            │
│                                     │
│                    ○ ● ○ ○ ○        │  ← Dots indicate slide position
│              🔥 Tonight's Buzz      │  ← Optional badge on user photos
└─────────────────────────────────────┘
     ◄                           ►
```

### Photo ordering:
1. Tonight's Buzz photos (newest first) - shows current vibe
2. Google Place photos - shows venue aesthetic

### Optional: Visual differentiation
- Add a small "Tonight" pill badge on user-contributed photos
- Or a subtle gradient/border color difference

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/VenueIdCard.tsx` | Extract buzz media URLs, combine with Google photos in carousel |

---

## Considerations

### Videos
Currently the carousel only displays images. Videos from Tonight's Buzz could either:
1. Be included as thumbnail previews that open fullscreen on tap
2. Be excluded from the carousel and only shown in the Buzz section (simpler)

For this implementation, I recommend **starting with images only** in the carousel - videos can remain in the Buzz section since they need playback controls.

### Performance
No additional API calls needed - the media clips are already fetched for the Tonight's Buzz section.

