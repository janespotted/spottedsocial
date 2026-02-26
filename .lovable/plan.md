

# Remove Purple Border Outlines from Cards

The purple border on post cards comes from the `.glass-card` CSS class in `src/index.css`, which has `border: 1px solid hsl(270 70% 50% / 0.25)` and a hover state that intensifies it. This is the root cause affecting all newsfeed cards, plan skeletons, and feed skeletons.

## Changes

### 1. `src/index.css` — Remove border from `.glass-card` class (lines 192-212)

Update the `.glass-card` utility to remove the border and border hover effect:

```css
.glass-card {
  background: linear-gradient(135deg, hsl(265 50% 8% / 0.9) 0%, hsl(265 50% 12% / 0.7) 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  /* border removed */
  box-shadow: 0 0 30px hsl(270 100% 65% / 0.08), inset 0 1px 0 hsl(270 100% 80% / 0.06);
}

.glass-card:hover {
  /* no border-color change */
  box-shadow: 0 0 40px hsl(270 100% 65% / 0.15), inset 0 1px 0 hsl(270 100% 80% / 0.1);
}
```

This fixes all cards using `glass-card`: newsfeed posts (Home.tsx, Feed.tsx), plan skeletons (PlansFeed.tsx), and feed skeletons (FeedSkeleton.tsx) in one change.

### 2. `src/components/PlansFeed.tsx` line 564 — Weekend Rally banner

Replace `border border-[#a855f7]/30` with no border:
```
bg-gradient-to-br from-[#a855f7]/20 to-[#7c3aed]/10 rounded-2xl p-4
```

### 3. `src/pages/Auth.tsx` line 227 — Auth card

The Auth card explicitly adds `border border-primary/30` on top of `glass-card`. Remove that explicit border class so it also goes borderless.

No other files need changes — the `.glass-card` CSS fix cascades to all consumers.

