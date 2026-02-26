

# What Could Be Better — Visual & UX Polish

After reviewing the app's current design, fonts, and overall UX, here are the most impactful improvements:

---

## Font Assessment

The current font stack (Montserrat) is solid for a social app — it's clean and modern. However, there are some typography issues:

1. **The "Spotted" header uses `tracking-[0.3em]` with `font-light`** — this ultra-spaced light weight looks a bit dated/generic. A tighter, bolder wordmark would feel more premium.
2. **Inconsistent text sizing** — subtitles jump between `text-sm`, `text-xs`, and `text-white/50` vs `text-white/60` with no clear hierarchy.
3. **No font weight variation** — almost everything is either `font-medium` or `font-semibold`. Using more weight contrast (regular body text vs bold headers) would improve readability.

## Recommended Improvements (in priority order)

### 1. Tighten typography hierarchy
- Make the "Spotted" wordmark bolder (`font-semibold tracking-[0.15em]`) for a more confident brand feel
- Standardize muted text to `text-white/50` everywhere (currently mixed 40/50/60)
- Use `font-normal` for body/caption text, `font-bold` for section headers

### 2. Add haptic-style micro-interactions
- The bottom nav has no press feedback — add `active:scale-95` on tap
- Post like button could use a quick scale bounce (`active:scale-110`)
- Tab switches feel flat — add a subtle transition on the yellow underline

### 3. Improve the header/status bar area
- The sticky header takes up a lot of vertical space (title + subtitle + tabs = ~180px)
- Collapse the subtitle when scrolling down to reclaim screen real estate
- The notification bell and search icons could be smaller/more compact

### 4. Polish the bottom navigation
- The Spotted logo as profile tab is confusing — users expect an avatar or person icon
- Add a subtle active background indicator (pill shape) instead of just color change
- The Map icon in the center should have a label like the others

### 5. Smooth page transitions
- Currently pages just mount/unmount with no transition
- Add a simple fade or slide transition between routes for a more app-like feel

---

These are design polish items — the app's functionality is strong. The biggest bang-for-buck improvement would be **tightening the typography** and **adding micro-interactions to the bottom nav and feed**.

