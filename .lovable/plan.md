

# Implement 6 Feed & Messaging Improvements

## Analysis Notes

- **Plans skeleton**: PlansFeed already has a loading skeleton (lines 523-539). However, the `isLoading` state in PlansFeed is internal and doesn't account for the parent `Home.tsx` loading state. When switching tabs, PlansFeed mounts fresh and shows skeleton correctly. This is actually working — but I'll make it more visually polished to match FeedSkeleton style.
- **Infinite scroll**: `loadMorePosts` exists in `useFeed.ts` (line 230) but nothing calls it from Home.tsx.
- **Video autoplay**: Videos render with `controls` and `muted` but no autoplay-on-scroll.
- **Typing indicators**: Requires a new DB table and realtime subscription.
- **Share to DMs**: Share button currently uses native share / clipboard only.

---

## 1. Infinite Scroll (Home.tsx)

Add an `IntersectionObserver` ref at the bottom of the posts list that triggers `loadMorePosts` when visible.

**Changes in `src/pages/Home.tsx`:**
- Add a `loadTriggerRef = useRef<HTMLDivElement>(null)` 
- Add `useEffect` with `IntersectionObserver` watching `loadTriggerRef`, calling `loadMorePosts()` when intersecting
- Render `<div ref={loadTriggerRef} />` after the `posts.map(...)` block
- Show a small loading spinner when `isLoadingMore` is true
- Show "No more posts" text when `!hasMorePosts && posts.length > 0`

---

## 2. Plans Tab Skeleton Polish

PlansFeed already has a skeleton (line 523). I'll upgrade it to be more visually consistent with FeedSkeleton (shimmer animation, glass-card style).

**Changes in `src/components/PlansFeed.tsx`:**
- Replace the existing skeleton block (lines 523-539) with a richer shimmer-based skeleton matching the app's glass-card aesthetic

---

## 3. Empty Feed State — Add "Create Post" CTA

**Changes in `src/pages/Home.tsx`:**
- In the nightlife-hours empty state (lines 372-387), add a second button: "Share what you're up to" that opens `setShowCreatePost(true)`
- Keep the existing "Set Your Status" button but add the post CTA above or below it

---

## 4. Typing Indicators in DMs

**Database migration:**
```sql
CREATE TABLE public.dm_typing_indicators (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.dm_typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can upsert own typing" ON public.dm_typing_indicators
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Thread members can view typing" ON public.dm_typing_indicators
  FOR SELECT USING (public.user_is_thread_member(thread_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_typing_indicators;
```

**New file: `src/hooks/useTypingIndicator.ts`**
- Exports `useTypingIndicator(threadId, userId)` returning `{ typingUsers, setTyping }`
- `setTyping()`: upserts row with current timestamp, auto-clears after 3s timeout
- Subscribes to realtime `postgres_changes` on `dm_typing_indicators` filtered by `thread_id`
- Filters out entries older than 5s and the current user
- Cleans up subscription on unmount

**Changes in `src/pages/Thread.tsx`:**
- Import and use `useTypingIndicator`
- Call `setTyping()` on input change (debounced, every 2s)
- Show "typing..." indicator below messages when `typingUsers.length > 0`
- Display as: `"{name} is typing..."` or `"{name1}, {name2} are typing..."`

**Changes in `src/components/MessageInput.tsx`:**
- Add optional `onTyping` callback prop
- Call `onTyping?.()` on each keystroke (parent handles debounce)

---

## 5. Video Autoplay on Scroll

**Changes in `src/pages/Home.tsx`:**
- Create a `useVideoAutoplay` effect or inline logic using `IntersectionObserver`
- For each `<video>` element in posts, observe it; when 50%+ visible, call `.play()` (muted); when out of view, call `.pause()`
- Add `ref` callback on video elements using a map of `postId → HTMLVideoElement`
- Remove the `controls` attribute initially; add a tap-to-unmute overlay or keep controls but autoplay muted

**Implementation approach:**
- Use a single `IntersectionObserver` instance for all videos
- Store video refs in a `Map<string, HTMLVideoElement>`
- On intersection: `entry.isIntersecting ? video.play() : video.pause()`
- Keep `muted`, `playsInline`, add `loop` for short clips
- Add `controls` so users can still manually control

---

## 6. Share Post to DMs

**New file: `src/components/ShareToDMModal.tsx`**
- Dialog/sheet showing friends list (reuse friend-fetching pattern from NewChatDialog)
- Search bar to filter friends
- On friend tap: find or create DM thread (using `create_dm_thread` RPC), send a message like `"[Shared a post] {post.text}"` with the post context, navigate to thread
- Accept props: `post: Post`, `open`, `onOpenChange`

**Changes in `src/pages/Home.tsx`:**
- Add state `sharePostId` for which post is being shared
- On share button click: show a choice — "Share to DM" option alongside existing native share
- Replace the current share button with a dropdown: "Send to Friend" and "Copy Link" / "Share"
- When "Send to Friend" selected, open `ShareToDMModal`

---

## Technical Details

### Infinite scroll observer setup:
```typescript
useEffect(() => {
  const el = loadTriggerRef.current;
  if (!el || feedMode !== 'newsfeed') return;
  const observer = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting) loadMorePosts(); },
    { rootMargin: '200px' }
  );
  observer.observe(el);
  return () => observer.disconnect();
}, [loadMorePosts, feedMode]);
```

### Video autoplay observer:
```typescript
const videoObserver = useRef<IntersectionObserver>();
useEffect(() => {
  videoObserver.current = new IntersectionObserver(
    (entries) => entries.forEach(e => {
      const video = e.target as HTMLVideoElement;
      e.isIntersecting ? video.play().catch(() => {}) : video.pause();
    }),
    { threshold: 0.5 }
  );
  return () => videoObserver.current?.disconnect();
}, []);
```

### Typing indicator debounce:
- Track `lastTypingSent` timestamp
- Only send typing upsert if 2+ seconds since last send
- Auto-delete typing row after 4s of no input (via `setTimeout`)

### Share to DM message format:
```
📸 Shared a post: "{truncated text}" — tap to view
```
Since posts are ephemeral, the shared message is a text summary rather than a deep link.

### Files created:
1. `src/hooks/useTypingIndicator.ts`
2. `src/components/ShareToDMModal.tsx`

### Files modified:
1. `src/pages/Home.tsx` — infinite scroll, video autoplay, empty state CTA, share to DM integration
2. `src/components/PlansFeed.tsx` — polished skeleton
3. `src/pages/Thread.tsx` — typing indicator display
4. `src/components/MessageInput.tsx` — onTyping callback
5. Database migration — `dm_typing_indicators` table

