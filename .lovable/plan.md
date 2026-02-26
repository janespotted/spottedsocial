

# Add Read Receipts + Settings Toggle for Typing/Read Receipts

## Testing Results — Typing Indicators

Typing indicators are **fully working end-to-end**:
- Typing in the message input triggers a `POST` to `dm_typing_indicators` (201 Created)
- Realtime subscription on `typing_{threadId}` channel is active
- Fetch of other typing users returns correctly (filtered by thread, excluding self, within 5s window)
- Auto-cleanup after 4s of inactivity via `setTimeout` + row deletion
- UI renders "{name} is typing..." with pulse animation below messages

One minor issue found: a `validateDOMNesting` warning (button inside button) in the 1:1 chat header — will fix as part of this change.

---

## Feature: Read Receipts

### Database Migration

Add a `dm_read_receipts` table to track when each user last read a thread:

```sql
CREATE TABLE public.dm_read_receipts (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.dm_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can upsert own read receipt"
  ON public.dm_read_receipts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Thread members can view read receipts"
  ON public.dm_read_receipts FOR SELECT
  USING (public.user_is_thread_member(thread_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_read_receipts;
```

Also add messaging preference columns to profiles:

```sql
ALTER TABLE public.profiles
  ADD COLUMN show_typing_indicators boolean NOT NULL DEFAULT true,
  ADD COLUMN show_read_receipts boolean NOT NULL DEFAULT true;
```

### New Hook: `src/hooks/useReadReceipts.ts`

- Exports `useReadReceipts(threadId, userId, messages)`
- On mount and when messages change: upsert own read receipt with current timestamp
- Subscribe to realtime changes on `dm_read_receipts` filtered by `thread_id`
- Return `readReceipts: Map<string, Date>` mapping `user_id` to their `last_read_at`
- Helper: `getLastSeenMessageId(userId)` — finds the latest message with `created_at <= last_read_at`

### Changes to `src/pages/Thread.tsx`

- Import and use `useReadReceipts`
- Below the last message sent by the current user that the other person has read, show a small "Seen" label (gray text, right-aligned)
- For group chats: show small avatar stack of who has seen the latest message
- Mark thread as read on mount and when new messages arrive
- Respect `show_typing_indicators` and `show_read_receipts` profile preferences — fetch current user's profile preferences and conditionally render/call

### Changes to `src/hooks/useTypingIndicator.ts`

- Accept an `enabled` parameter (default `true`)
- When `enabled` is `false`, skip upsert calls and don't subscribe to realtime
- This allows the Settings toggle to disable typing indicators

---

## Feature: Settings Toggle

### Changes to `src/pages/Settings.tsx`

Add a new "Chat Preferences" card between Push Notifications and City Selector with two toggles:
- **Typing Indicators** — toggle `show_typing_indicators` on profiles table
- **Read Receipts** — toggle `show_read_receipts` on profiles table

When toggled off:
- Typing indicators: user's typing won't be broadcast, and they won't see others typing
- Read receipts: user's read status won't be sent, and they won't see others' read status

Implementation:
- Fetch current values from profiles on mount
- On toggle: update profiles table and show toast confirmation
- Use the `MessageSquare` icon for the card

---

## File Changes Summary

### New files:
1. `src/hooks/useReadReceipts.ts` — read receipt tracking hook

### Modified files:
1. `src/pages/Thread.tsx` — integrate read receipts display, respect preferences, fix button nesting
2. `src/hooks/useTypingIndicator.ts` — add `enabled` parameter
3. `src/pages/Settings.tsx` — add Chat Preferences section with toggles
4. Database migration — `dm_read_receipts` table + profile columns

---

## Technical Details

### Read receipt display logic:
- For 1:1 chats: show "Seen" under the last message the other person has read
- Only show under the current user's sent messages (not received ones)
- Use small gray italic text, right-aligned: `Seen`

### Read receipt upsert:
```typescript
await supabase
  .from('dm_read_receipts')
  .upsert({ thread_id, user_id, last_read_at: new Date().toISOString() });
```
Called on: thread mount, new message received via realtime, and window focus.

### Settings preference flow:
- Fetch: `supabase.from('profiles').select('show_typing_indicators, show_read_receipts').eq('id', user.id).single()`
- Update: `supabase.from('profiles').update({ show_typing_indicators: value }).eq('id', user.id)`
- Thread.tsx reads these preferences and conditionally enables/disables features

### Button nesting fix (Thread.tsx line 464-494):
The 1:1 chat header has a `<button>` wrapping the avatar/name, with another `<button>` for the venue name inside it. Fix by changing the outer `<button>` to a `<div>` with `onClick` and `cursor-pointer`, or restructure so the venue button is outside the parent button.

