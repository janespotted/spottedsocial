

## Simplify Business Dashboard Quick Actions

### Overview

Update the Quick Actions section on the Business Dashboard to remove the "View Map" button and add helpful descriptions under each remaining action.

---

### Current State

```text
+----------------------------------------+
|  Quick Actions                         |
|  [Promote] [Yap] [View Map]            |
+----------------------------------------+
```

3 buttons in a row, no descriptions, generic "Quick Actions" header.

---

### Proposed Changes

```text
+----------------------------------------+
|  Grow Your Venue                       |
|                                        |
|  [Promote]              [Yap]          |
|  Boost visibility       Post updates  |
|  on the leaderboard     to your guests|
+----------------------------------------+
```

---

### Specific Updates

| Change | Before | After |
|--------|--------|-------|
| Section Title | "Quick Actions" | "Grow Your Venue" |
| Buttons | 3 (Promote, Yap, View Map) | 2 (Promote, Yap) |
| Layout | 3-column grid | 2-column grid |
| Descriptions | None | Short text under each button |

---

### Button Descriptions

| Button | Description |
|--------|-------------|
| Promote | "Boost visibility on the leaderboard" |
| Yap | "Post updates to your guests" |

---

### File to Modify

| File | Change |
|------|--------|
| `src/pages/business/BusinessDashboard.tsx` | Remove View Map button, change grid to 2 columns, add description text, rename section header |

