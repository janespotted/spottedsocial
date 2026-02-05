

## Improve Promoted Venues Management System

### The Problem

Currently there's a disconnect between Admin and Leaderboard:
- **Admin** lets you mark unlimited venues as "Leaderboard Promoted"
- **Leaderboard** only shows the top 2 promoted spots

This creates confusion: you see 6 promoted venues in Admin, but only 2 appear on the leaderboard. The other 4 are "promoted" in the database but invisible to users.

---

### Recommended Approach: "Active" vs "Waitlist" System

Instead of letting unlimited venues be marked promoted, add a clear distinction:

| Status | Description | Visible on Leaderboard |
|--------|-------------|------------------------|
| **Active** (max 2) | Currently displayed in promoted section | Yes |
| **Waitlist** | Queued for future promotion | No |

---

### How It Would Work

**In Admin Panel:**

```text
┌─────────────────────────────────────────┐
│ Leaderboard Promoted                    │
├─────────────────────────────────────────┤
│ ACTIVE SPOTS (2/2)                      │
│ ┌─────────────────────────────────────┐ │
│ │ 1. Venue A          [↓ Move Down]   │ │
│ │ 2. Venue B          [Remove]        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ WAITLIST (4 venues)                     │
│ ┌─────────────────────────────────────┐ │
│ │ 3. Venue C          [↑ Activate]    │ │
│ │ 4. Venue D          [Remove]        │ │
│ │ 5. Venue E          [Remove]        │ │
│ │ 6. Venue F          [Remove]        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [+ Search to add to waitlist...]        │
└─────────────────────────────────────────┘
```

**User Flow:**
1. When you add a venue, it goes to the waitlist
2. You can drag/reorder the waitlist
3. To show a venue on the leaderboard, you either:
   - Remove one of the 2 active spots, OR
   - Click "Activate" which swaps it with the last active venue

---

### Alternative Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **A. Waitlist (recommended)** | Clear distinction, intuitive queue | Slightly more complex UI |
| **B. Hard limit of 2** | Simple - can't add more than 2 | Less flexibility for future planning |
| **C. Show warning only** | Minimal code change | Still confusing - doesn't solve the core issue |

---

### Implementation Details

**Database Change:**
Add a `promotion_order` integer column to `venues` table (or use existing `popularity_rank`):
- Order 1-2 = Active (shown on leaderboard)
- Order 3+ = Waitlist (not shown)

**Admin Panel Changes:**
1. Split the promoted venues list into "Active" and "Waitlist" sections
2. Show "2/2 spots filled" indicator
3. Add reorder/swap functionality
4. Prevent adding to Active if 2 spots filled (auto-add to waitlist)

**Leaderboard Changes:**
None needed - already only shows top 2 via `.slice(0, 2)`

---

### Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add `leaderboard_promo_order` column to venues |
| `src/pages/Admin.tsx` | Redesign promoted section with Active/Waitlist split, add reorder controls |
| `src/pages/Leaderboard.tsx` | Query by `leaderboard_promo_order` instead of just filtering by `is_leaderboard_promoted` |

---

### Quick Alternative: Just Enforce Limit

If you want a simpler solution, I can just:
1. Limit Admin to only allow 2 leaderboard-promoted venues at a time
2. Show "2/2 spots filled - remove one to add another"
3. No waitlist, just a hard cap

Which approach do you prefer?

