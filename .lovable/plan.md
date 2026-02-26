
Goal: Fix the text-only post layout in the actual newsfeed screen the user is viewing (`/` route), so caption renders above the engagement row when there is no media.

What I found:
1. The previous fix was applied in `src/pages/Feed.tsx` (the `/feed` route).
2. The user is on `/` (Home), and `src/pages/Home.tsx` has a separate post-card JSX.
3. In `Home.tsx`, inside each post card:
   - Engagement row (`likes/comments/share`) is rendered first.
   - Text-only caption block (`!post.image_url && post.text`) is rendered after that row.
   - This is exactly why text-only posts still appear broken.
4. This is a frontend-only rendering issue; no backend/database/auth changes are needed.

Implementation plan:

1) Update the correct post-card renderer in `src/pages/Home.tsx`
- Target section: `posts.map((post, index) => ...)` inside newsfeed mode.
- Specifically the card content container:
  - Current order in this container is:
    - Engagement row
    - Image-caption block (`post.image_url && post.text`)
    - Text-only block (`!post.image_url && post.text`)
- Change to:
  - Text-only caption block first (only when no media)
  - Engagement row
  - Media-caption block last (only when media exists)

2) Keep media-post behavior unchanged
- For posts with media (`post.image_url`), preserve:
  - Header
  - Media
  - Engagement row
  - Caption below row
- Only text-only posts get the reordered caption.

3) Keep structure/styles/events unchanged except position
- Do not alter like/comment/share handlers.
- Do not alter comment expansion block.
- Do not alter media rendering block behavior.
- Only move the text-only JSX block above the engagement row.

Expected render order after fix:

```text
Text-only post:
Header (avatar/name/venue/time)
Caption text
Likes + Comments + Share
Comments thread (if expanded)

Media post:
Header (avatar/name/venue/time)
Media
Likes + Comments + Share
Caption text
Comments thread (if expanded)
```

Technical details (exact JSX move):
- In `src/pages/Home.tsx`, move:

- From current location (below buttons):
  `{!post.image_url && post.text && (<div className="text-white text-base leading-relaxed">{post.text}</div>)}`
- To immediately before the engagement buttons `<div className="flex items-center gap-4">...</div>` inside the same `p-4 space-y-3` container.

Validation checklist:
1. Open `/` and verify a text-only post now shows caption above engagement row.
2. Verify media post still shows caption below engagement row.
3. Verify like/comment/share interactions still work.
4. Expand comments on both post types and confirm spacing/order remains visually correct.
5. Quick mobile viewport check to ensure wrapping/spacing remains stable.

Out of scope (not required for this fix):
- Refactoring `Home.tsx` and `Feed.tsx` into a shared post-card component (could be done later to avoid layout drift between routes).
