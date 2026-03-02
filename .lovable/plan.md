

## Current State: Web Push Notifications

The infrastructure is fully built and the VAPID keys are configured. Here's the gap:

### What works
- Service worker registered on web (`sw.js`)
- `usePushNotifications` hook handles subscribe/unsubscribe with VAPID
- `send-push` edge function implements full RFC 8291 Web Push encryption + APNs
- VAPID keys are set as secrets

### The problem: most notification flows never trigger push

`triggerPushNotification()` is only called in **2 places**:
1. `VenueInviteContext.tsx` (venue invites)
2. `MeetUpContext.tsx` (meetup requests)

But notifications are created in **8+ places** via `create_notification` / `create_notifications_batch` RPC — and these **never call push**:

| Flow | File | Push triggered? |
|------|------|----------------|
| Venue invite | `VenueInviteContext.tsx` | Yes |
| Meetup request | `MeetUpContext.tsx` | Yes |
| Rally nudge | `Friends.tsx` | **No** |
| Rally nudge | `MyFriendsTab.tsx` | **No** |
| Plan "I'm down" | `PlanItem.tsx` | **No** |
| Private party invite | `PrivatePartyInviteModal.tsx` | **No** |
| Meetup accepted | `ActivityTab.tsx` | **No** |
| Venue invite accepted | `ActivityTab.tsx` | **No** |
| Address request | `PrivatePartyCard.tsx` | **No** |
| Venue yap | `useYapNotifications.ts` | **No** |
| Post liked (DB trigger) | `notify_post_liked()` | **No** |
| Post commented (DB trigger) | `notify_post_commented()` | **No** |
| Invite accepted (DB trigger) | `notify_inviter_on_signup()` | **No** |

### Fix approach

**For client-side flows (6 files):** Add `triggerPushNotification()` calls after each `create_notification` / `create_notifications_batch` RPC call, matching the existing pattern in MeetUpContext.

**For DB trigger flows (3 triggers):** These insert notifications server-side — the client never sees the inserted row. The cleanest fix is to add a **database trigger** on the `notifications` table that automatically calls the `send-push` edge function via `pg_net` (Supabase's HTTP extension). However, `pg_net` may not be available. The simpler alternative is to leave DB-trigger notifications (post likes, comments, invite accepted) as in-app only for now, and add push to the 6 client-side flows.

### Changes

| File | Change |
|------|--------|
| `src/pages/Friends.tsx` | Add `triggerPushNotification` after rally notification RPC |
| `src/components/MyFriendsTab.tsx` | Add `triggerPushNotification` after rally notification RPC |
| `src/components/PlanItem.tsx` | Add `triggerPushNotification` after "I'm down" notification RPC |
| `src/components/PrivatePartyInviteModal.tsx` | Add `triggerPushNotification` for each party invite notification |
| `src/components/PrivatePartyCard.tsx` | Add `triggerPushNotification` after address request notification |
| `src/components/messages/ActivityTab.tsx` | Add `triggerPushNotification` after meetup_accepted and venue_invite_accepted RPCs |

Also need to add `'rally'`, `'plan_down'`, `'address_request'`, `'private_party_invite'` to the `VALID_NOTIFICATION_TYPES` array in `send-push/index.ts`, since it currently rejects any type not in its allowlist.

| File | Change |
|------|--------|
| `supabase/functions/send-push/index.ts` | Add missing notification types to `VALID_NOTIFICATION_TYPES` |

