

## Plan: Show Yap Media in Venue ID Card Carousel

### What Changes

In `src/components/VenueIdCard.tsx`:

1. **Add state** for yap media: `yapMedia` — an array of `{ url: string; media_type: string }`.

2. **Fetch yap media** when the venue loads. Query `yap_messages` for rows matching the venue name that have a non-null `image_url`, are not expired, ordered by `created_at desc`, limit ~10. Generate signed URLs from the `yap-media` bucket for each.

3. **Merge into carousel**: The carousel array becomes Google photo(s) first, then yap media items. For video entries (`media_type = 'video'`), render a `<video>` tag (muted, controls, playsInline) instead of `<img>`.

### No database or backend changes needed
- `yap_messages` already has `image_url` and `media_type`
- `yap-media` bucket already exists with signed URL access for authenticated users
- RLS on `yap_messages` already allows authenticated users to SELECT non-expired messages

### File changes

| File | Change |
|------|--------|
| `src/components/VenueIdCard.tsx` | Add `yapMedia` state, fetch yap media with signed URLs on venue load, merge into carousel, render video/image based on `media_type` |

