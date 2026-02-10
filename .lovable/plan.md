

# Add Fake DMs to Messages Section in Demo Mode

## Problem
The Messages tab is empty in demo mode because the seed function never creates DM threads or messages between the real user and demo users.

## Solution

**File: `supabase/functions/seed-demo-data/index.ts`**

Add DM thread and message seeding at the end of the `seed` action. The seed function already receives `userId` (the real user's ID) in the request body.

### What gets seeded:
- 4 DM threads between the real user and 4 different demo users
- Each thread gets 2-3 messages with realistic nightlife chat content (mix of sent by demo user and the real user)
- Messages are timestamped within the last 1-2 hours so they appear recent

### Implementation:

1. Pick 4 demo user IDs for conversations
2. For each, call the existing `create_dm_thread` RPC (or insert directly into `dm_threads` + `dm_thread_members` using service role)
3. Insert `dm_messages` with varied timestamps and demo-appropriate text like:
   - "Are you coming out tonight?"
   - "We're at Le Bain, come through!"
   - "Omw! Save me a spot"
   - "This DJ is insane rn"

### Cleanup:
On `clear` action, delete DM messages and threads created with demo users (find threads where a member is a demo user profile).

### No changes needed to MessagesTab
The `MessagesTab` already includes demo user threads when `demoEnabled` is true (line 147-149 only filters them in bootstrap-without-demo mode). So once threads + messages exist in the DB, they'll show up automatically.

## Summary

| File | Change |
|------|--------|
| `supabase/functions/seed-demo-data/index.ts` | Add DM thread creation (4 threads) with 2-3 messages each between real user and demo users; clean up on `clear` |

