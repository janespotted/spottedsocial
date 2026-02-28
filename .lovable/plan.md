

## Migration: Block direct notification inserts, add `create_notification` RPC

### Problem

6 locations across the frontend directly insert into the `notifications` table. The current INSERT policy allows any authenticated user to create notifications for anyone, which could be abused.

### Database migration (single migration file)

**Step 1** — Drop permissive INSERT policy and block direct inserts:

```sql
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;

CREATE POLICY "Only server can create notifications"
  ON public.notifications
  FOR INSERT WITH CHECK (false);
```

**Step 2** — Create two SECURITY DEFINER RPC functions:

1. `create_notification(p_receiver_id uuid, p_type text, p_message text)` — returns the full inserted row (needed for push notification triggering). Validates `auth.uid()` is not null.

2. `create_notifications_batch(p_notifications jsonb)` — accepts a JSON array of `{receiver_id, type, message}` objects, inserts all with `sender_id = auth.uid()`, returns all inserted rows. Needed by `VenueInviteContext` and `PrivatePartyInviteModal` which insert multiple notifications at once.

Both functions grant EXECUTE to `authenticated`.

### Frontend changes (6 call sites)

| File | Current | New |
|------|---------|-----|
| `src/contexts/MeetUpContext.tsx` (~line 146) | `.from('notifications').insert({...}).select().single()` | `.rpc('create_notification', {p_receiver_id, p_type, p_message})` then use returned row |
| `src/contexts/VenueInviteContext.tsx` (~line 82) | `.from('notifications').insert(array).select()` | `.rpc('create_notifications_batch', {p_notifications: JSON})` then use returned rows |
| `src/components/messages/ActivityTab.tsx` (~line 443) | `.from('notifications').insert({...})` (meetup_accepted) | `.rpc('create_notification', {...})` |
| `src/components/messages/ActivityTab.tsx` (~line 478) | `.from('notifications').insert({...})` (venue_invite_accepted) | `.rpc('create_notification', {...})` |
| `src/components/PlanItem.tsx` (~line 215) | `.from('notifications').insert({...})` | `.rpc('create_notification', {...})` |
| `src/components/PrivatePartyCard.tsx` (~line 49) | `.from('notifications').insert({...})` | `.rpc('create_notification', {...})` |
| `src/components/PrivatePartyInviteModal.tsx` (~line 152) | `.from('notifications').insert(array)` | `.rpc('create_notifications_batch', {...})` |

### Technical details

**`create_notification` function:**
```sql
CREATE OR REPLACE FUNCTION public.create_notification(
  p_receiver_id uuid, p_type text, p_message text
) RETURNS SETOF notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (auth.uid(), p_receiver_id, p_type, p_message)
  RETURNING *;
END;
$$;
```

**`create_notifications_batch` function:**
```sql
CREATE OR REPLACE FUNCTION public.create_notifications_batch(
  p_notifications jsonb
) RETURNS SETOF notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  notif jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    RETURN QUERY
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (auth.uid(), (notif->>'receiver_id')::uuid, notif->>'type', notif->>'message')
    RETURNING *;
  END LOOP;
END;
$$;
```

Each frontend call site change is mechanical — replace `.from('notifications').insert(...)` with the corresponding `.rpc(...)` call and adapt the response shape. The existing trigger-based notifications (`notify_post_liked`, `notify_post_commented`, `notify_inviter_on_signup`) are unaffected since they run as SECURITY DEFINER.

