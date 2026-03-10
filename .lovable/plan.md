

## Plan: Add Read Receipts to Messages

The database already has a `dm_read_receipts` table (thread_id, user_id, last_read_at) and a `show_read_receipts` boolean on profiles. Neither is used in code yet.

### How it works

1. **Mark as read** — When a user opens a thread, upsert their read receipt (`dm_read_receipts`) with the current timestamp. This runs on mount and whenever new messages arrive from others.

2. **Show "Seen" indicator** — In 1:1 chats, below the last message sent by the current user, show "Seen" if the other user's `last_read_at` is after that message's `created_at`. Subscribe to realtime changes on `dm_read_receipts` so the indicator appears live.

3. **Respect privacy toggle** — Only show "Seen" if BOTH users have `show_read_receipts` enabled. The sender's own read receipt is always written (so the other person can see it), but the UI only renders the label when both parties opt in.

### Files to modify

| File | Change |
|------|--------|
| `src/pages/Thread.tsx` | Upsert read receipt on mount/new messages. Fetch other user's last_read_at. Subscribe to realtime updates on `dm_read_receipts`. Render "Seen" under the last sent message when applicable. |
| `src/pages/Settings.tsx` | Add a "Read Receipts" toggle that updates `profiles.show_read_receipts`. |
| `src/components/messages/MessagesTab.tsx` | Use read receipts to improve unread detection (replace the 30-min heuristic with actual read state). |

### UI detail

- "Seen" text appears in `text-white/40 text-xs` below the last outgoing message bubble, right-aligned
- Only shown in 1:1 threads (not group chats for v1)

