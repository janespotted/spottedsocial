

# Fix: DM Push Notifications Not Triggering

## Root Cause

The `notifications` table has an RLS INSERT policy called **"Only server can create notifications"** with `with_check: false`, which **blocks all client-side inserts**. 

The DM flow in `Thread.tsx` (line 390) does a direct `supabase.from('notifications').insert(...)` — this silently fails due to RLS, so `triggerPushNotification()` is never called.

Other notification flows (meetup, venue invite, check-in) work because they use the `create_notification` RPC function, which is `SECURITY DEFINER` and bypasses RLS.

## Fix

Update `Thread.tsx` to use the existing `create_notification` RPC instead of a direct insert. This RPC already exists and handles authentication.

### Changes

**`src/pages/Thread.tsx`** — Replace the direct notification insert (lines 388-406) with:
- Call `supabase.rpc('create_notification', ...)` for each recipient
- Extract the returned notification to call `triggerPushNotification()`
- Filter out the sender from `recipientIds` in group chats (line 383 currently includes all members)

### Technical Detail

```text
Current (broken):
  supabase.from('notifications').insert({...})  →  blocked by RLS  →  no push

Fixed:
  supabase.rpc('create_notification', {...})  →  SECURITY DEFINER bypasses RLS  →  push fires
```

No database migrations needed. No edge function changes needed.

