

## Plan: Leaderboard Energy Cron Job

### 1. Create edge function `refresh-leaderboard-energy/index.ts`

Logic:
- Use service role key (no auth needed — triggered by cron)
- Delete expired demo `night_statuses` (`is_demo = true AND expires_at < now()`)
- For each city (`nyc`, `la`, `pb`), fetch top 20 venues by `popularity_rank`
- Fetch all 12 demo user profile IDs
- Randomize energy distribution each cycle:
  - Randomly pick 3-4 venues from ranks 8-20 to get "boosted" (20-30 statuses)
  - Randomly assign some top-5 venues lower energy (5-10 statuses)
  - All other venues get random 3-15 statuses
- Since there are only 12 demo users, each venue's count is capped at 12. Statuses will reuse demo user IDs across different venues (a demo user can have `night_status` at only one venue via upsert, so we'll use direct inserts with unique IDs rather than upserts — multiple statuses per demo user across venues is fine since these are just energy counters, not real check-ins)
- Actually, `night_statuses` has a unique constraint on `user_id`. So with 12 demo users we can only have 12 total active statuses. This is a problem.

**Key constraint**: `night_statuses` likely has a unique index on `user_id` (the seed function uses `upsert` with `onConflict: 'user_id'`). Let me verify this and adjust approach.

Wait — looking at the seed function, it inserts 8 "out" statuses + 4 "planning" statuses = 12 total, one per demo user. So yes, each demo user can only have one active night_status.

With only 12 demo users, we can place at most 12 statuses across all venues per city. The energy counts on the leaderboard come from counting `night_statuses` rows per venue. So the maximum energy any single venue can show is 12 (all demo users there).

The user's request says "top 5 venues get 20-30 statuses" which is impossible with 12 demo users. We need to either:
1. Create more demo users in this function, or
2. Work within the 12-user constraint and distribute them across venues (e.g., 3-4 at the hottest venue, 2-3 at next, etc.)

Given the constraint, I'll distribute the 12 demo users across venues with randomized allocation each cycle, creating natural fluctuation. The energy bars in the leaderboard use thresholds (rank-based in bootstrap mode anyway), so the actual count matters less than the rank order.

### Revised approach

Since energy bars in bootstrap mode are determined by **venue ranking position** (not check-in counts) — rank 1-7 = 3 bars, 8-14 = 2 bars, 15+ = 1 bar — the demo `night_statuses` just need to **exist** at venues so they appear on the leaderboard at all. The actual count per venue doesn't drive the energy display in bootstrap mode.

So the function will:
1. Delete expired demo night_statuses
2. Distribute 12 demo users across top venues in each city, randomizing which venues get users each cycle
3. This ensures different venues appear "active" each refresh

### Files to create/modify

1. **`supabase/functions/refresh-leaderboard-energy/index.ts`** — new edge function
2. **Migration** — enable `pg_cron` and `pg_net` extensions
3. **SQL insert** — schedule the cron job to call the function every 4 hours
4. **`supabase/config.toml`** — add `verify_jwt = false` for the new function (auto-managed, no edit needed from me)

### Technical detail

The cron schedule uses `pg_cron` + `pg_net` to POST to the edge function URL every 4 hours. The edge function uses the service role key to bypass RLS and directly manipulate demo data.

