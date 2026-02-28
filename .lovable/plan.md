

## Diagnosis: 5 Issues Found

### Issue 1: No avatars on map in demo mode
**Root cause**: The `night_statuses` table has an RLS SELECT policy that requires `auth.uid() = user_id OR can_see_location(auth.uid(), user_id)`. Demo users are not friends with real users, so `can_see_location` returns `false`. The demo mode map query (lines 305-336 of Map.tsx) joins `night_statuses` with `profiles`, but RLS silently filters out all demo user rows.

**Fix**: Add an RLS policy on `night_statuses` allowing authenticated users to read rows where the user is a demo profile:
```sql
CREATE POLICY "Demo statuses are visible to authenticated users"
  ON public.night_statuses FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = night_statuses.user_id AND p.is_demo = true
    )
  );
```

### Issue 2: "No friends out" in demo mode
**Same root cause as Issue 1** — the Home page and friends list also query `night_statuses` which gets blocked by the same RLS policy. The policy fix above resolves this too.

### Issue 3: Venue invite failed
**Root cause**: The `create_notifications_batch` RPC is `SECURITY DEFINER` and bypasses RLS, so the INSERT itself should work. However, the `VenueInviteContext` (line 82-89) passes the notifications array but the function signature expects `p_notifications jsonb`. The issue is likely that the response shape from `RETURNS SETOF notifications` doesn't match what the code expects. Need to check if the function is returning data at all — the `insertedNotifications` at line 94 iterates to trigger push. If the function errors (e.g., due to a data type mismatch), the catch block shows the toast error.

Actually, re-examining: the code looks correct. The more likely cause is that when inviting demo users in demo mode, it tries to create notifications for demo user UUIDs, and `create_notifications_batch` fires `triggerPushNotification` which calls the `send-push` edge function — and that might fail looking up the demo user's push subscription. But the error toast says "Failed to send invites" which means line 91 `if (error) throw error` triggered. Let me check if the `create_notifications_batch` function has any issue with the `sender_id` column — the function hardcodes `auth.uid()` as `sender_id`, which should work in SECURITY DEFINER context.

Wait — I need to check: does `create_notifications_batch` actually exist and work? It was created in the recent migration. Let me verify there's no type mismatch. The function looks correct. The error may actually be from a different source. The user should test again and provide the specific error. But for now, let's ensure the RPC types are properly generated.

### Issue 4: No yap for private party
**Root cause**: The user's yap was created with `is_private_party: false` (as shown in DB query). When the user posts from a private party, the yap should have `is_private_party: true` with `party_lat`/`party_lng` set. Need to check the yap posting flow to ensure private party status is properly passed through. The existing yap has `venue_name: Venice Beach Bar & Kitchen` which doesn't match a private party posting.

This is likely a frontend issue where the yap posting component doesn't detect/pass private party state.

### Issue 5: Slow map pin loading
**Root cause**: Venue pins use Mapbox native clustering via a GeoJSON source. The query `get_profiles_safe` fetches ALL profiles (O(total users)), and then the map fetches venues, friendships, close friends, night statuses — that's 5-7 sequential queries before any pins render. The initial load waterfall is:
1. Profile fetch
2. Night status fetch  
3. Friendship queries (sent + received)
4. `get_profiles_safe` RPC (all profiles)
5. Night statuses for friends
6. Close friends query
7. All friendships for friends
8. Venue query

This is a lot of sequential work. But this is a pre-existing performance issue, not caused by recent changes.

---

## Plan

### Migration (single file)
1. Add RLS policy on `night_statuses` to allow authenticated users to read demo user statuses
2. This fixes Issues 1, 2, and likely 3 (if the invite was to a demo user whose notification references a demo user)

### Frontend: Fix yap private party posting
Need to inspect the yap posting flow to ensure private party status is propagated. Will check after migration.

### Investigate invite failure
After the RLS fix is applied, test the invite flow again — the error may resolve since demo user data will be accessible.

