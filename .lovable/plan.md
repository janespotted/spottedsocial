

# Add Video Posting to the Newsfeed

## Overview
Add video support to the post creation flow and newsfeed rendering, matching how Yap threads handle video. This requires a database migration, changes to 5 files, and updates to the storage utility.

## Database Migration

Add a `media_type` column to the `posts` table:

```sql
ALTER TABLE public.posts ADD COLUMN media_type text DEFAULT NULL;
```

Values will be `'image'`, `'video'`, or `null` (for text-only posts). No RLS changes needed since existing policies cover the column automatically.

## File Changes

### 1. `src/components/PostMediaPicker.tsx`
- Change both file input `accept` attributes from `"image/*"` to `"image/*,video/*"`
- Update size validation: check `file.type.startsWith('video/')` — if video, cap at 50MB; if image, keep 10MB
- For video files, use `URL.createObjectURL(file)` instead of `FileReader.readAsDataURL` (faster, avoids memory issues with large video files)
- Rename "Choose from Gallery" to "Choose from Gallery" (no change needed, already generic)

### 2. `src/components/CreatePostDialog.tsx`
- Add `mediaType` state (`'image' | 'video'`) alongside `imageFile`/`imagePreview`
- Derive media type from the selected file's MIME type in `handleMediaSelect`
- Pass `mediaType` to `PostCaptionScreen`
- Reset `mediaType` on dialog close and back navigation

### 3. `src/components/PostCaptionScreen.tsx`
- Update props interface: add `mediaType: 'image' | 'video'`
- In the preview section (line 233-241): conditionally render `<video>` (muted, no autoplay, controls, playsInline) for video, `<img>` for image
- In `uploadImage` (rename to `uploadMedia`): use same `post-images` bucket (works for both), adjust error message
- In `handleShare`: include `media_type: mediaType` in the insert payload (cast via `as any` since types won't regenerate immediately)

### 4. `src/hooks/useFeed.ts`
- Add `media_type: string | null` to the `Post` interface

### 5. `src/pages/Home.tsx`
- In the media rendering block (lines 462-473): conditionally render `<video>` or `<img>` based on `post.media_type`
  - Video: `<video src={post.image_url} controls playsInline muted className="w-full h-full object-cover" />`
  - Image: keep existing `<img>` tag
- Update the `!post.image_url` checks throughout the post card to also consider media_type (existing logic works since `image_url` is used for both — no change needed here)

### 6. `src/lib/storage-utils.ts`
- No changes needed — `resolvePostImageUrl` already handles any file path in the `post-images` bucket, works for video files too

### 7. `src/pages/Feed.tsx`
- Same conditional video/image rendering as Home.tsx for the `/feed` route (mirror the change)

## Technical Details

- Videos use the same `post-images` storage bucket (private, signed URLs)
- Media type is determined client-side from `file.type` (`startsWith('video/')` → `'video'`, else `'image'`)
- Video preview in composer: `<video src={preview} muted playsInline controls className="w-full h-full object-cover rounded-2xl" />`
- Video in feed: `<video src={post.image_url} controls playsInline className="w-full h-full object-cover" />` — same aspect-square container, same border radius
- The `as any` cast on insert is temporary until the types file auto-regenerates after migration

