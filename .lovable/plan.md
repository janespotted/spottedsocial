

## Plan: Fix Yap Upvote Not Persisting + Restyle Yap Activity Card

### Problem 1: Score stays at 0 after upvoting

The `handleVote` function in `VenueYapThread.tsx` inserts into `yap_votes` (works — RLS allows inserts) then tries to UPDATE `yap_messages.score`. But there is **no UPDATE RLS policy on `yap_messages`**, so the update silently fails. The local state updates optimistically but the DB never changes, so on refresh it's back to 0.

**Fix — two options (use both for robustness):**

1. **Add an RLS policy** allowing authenticated users to update the `score` column on `yap_messages`:
   ```sql
   CREATE POLICY "Authenticated users can update yap score"
     ON yap_messages FOR UPDATE
     USING (auth.uid() IS NOT NULL)
     WITH CHECK (auth.uid() IS NOT NULL);
   ```

2. **Better long-term**: Create a database function `increment_yap_score(p_yap_id uuid, p_delta int)` that runs with `SECURITY DEFINER` so it bypasses RLS. This is safer since users can only adjust score through the controlled function, not arbitrarily update other fields. The function would:
   ```sql
   CREATE OR REPLACE FUNCTION increment_yap_score(p_yap_id uuid, p_delta int)
   RETURNS void AS $$
   BEGIN
     UPDATE yap_messages SET score = score + p_delta WHERE id = p_yap_id;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```
   Then in `VenueYapThread.tsx`, replace the direct update with:
   ```typescript
   await supabase.rpc('increment_yap_score', { p_yap_id: yapId, p_delta: scoreDelta });
   ```

I recommend option 2 (SECURITY DEFINER function) as it's more secure — prevents users from arbitrarily setting scores.

### Problem 2: Yap activity card is orange — should match app theme

The "Yaps at Your Spot" card uses `amber-400`/`amber-500` styling. Change to match the app's purple/lime theme:

**`src/components/messages/ActivityTab.tsx`**:
- Change yap icon circle from `bg-amber-500/20 border-amber-400/60` → `bg-purple-500/20 border-purple-400/60`
- Change icon color from `text-amber-400` → `text-[#d4ff00]`
- Change subtitle text from `text-amber-400` → `text-[#d4ff00]`
- Change "View" button from `bg-amber-500` → `bg-[#d4ff00] text-black`

### Files Changed

| File | Change |
|------|--------|
| Migration SQL | Create `increment_yap_score` function (SECURITY DEFINER) |
| `src/components/messages/VenueYapThread.tsx` | Replace direct score UPDATE with `supabase.rpc('increment_yap_score', ...)` |
| `src/components/messages/ActivityTab.tsx` | Restyle yap activity card from amber/orange to purple/lime theme |

