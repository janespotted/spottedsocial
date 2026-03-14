

## Push Notifications for DM Messages: Show Sender Name + Preview

### Problem
1. **No push notification is sent for DMs** — `Thread.tsx` inserts into `dm_messages` but never calls `triggerPushNotification`. The in-app banner works via realtime subscription, but native/web push notifications are never fired.
2. **Generic notification content** — `getNotificationContent` shows "💬 New Message" without the sender's name.

### Plan

#### 1. Trigger push notification when sending a DM (Thread.tsx)
After successfully inserting a `dm_messages` row, create a notification record and call `triggerPushNotification` for each recipient in the thread (excluding the sender). For group chats, notify all other members.

- Insert a notification with `type: 'dm'`, `message` containing the sender's name + message preview (e.g. `"Jane: Hey are you coming tonight?"`)
- Call `triggerPushNotification` with that notification

#### 2. Update notification content in send-push edge function
Change `getNotificationContent` for the `'dm'` case to use the sender's name in the title:
```
case "dm":
  return { title: `💬 ${senderName}`, body: message, url: "/messages" };
```
This way the push notification shows "💬 Jane" as the title and the message preview as the body.

#### 3. Pass sender name to edge function (already works)
The edge function already fetches `senderName` from the profiles table (line 674-676) and passes it to `getNotificationContent`. The `_senderName` parameter just needs to be used instead of ignored.

### Files Changed
- `src/pages/Thread.tsx` — Add push notification trigger after sending a DM
- `supabase/functions/send-push/index.ts` — Update `getNotificationContent` for `'dm'` type to include sender name in title

