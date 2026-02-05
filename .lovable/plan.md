

# Weekend Rally: Thursday Ritual Implementation

## Overview
Add a recurring Thursday push notification ("What's the move this weekend?") that creates a predictable weekly engagement moment, driving anticipation and coordination for the weekend.

---

## How It Works

### User Experience Flow
1. **Thursday ~4pm**: User receives push notification "What's the move this weekend? 🎉"
2. **Tap notification**: Opens app directly to Plans Feed filtered to "This Weekend"
3. **Plans Feed shows**:
   - "X friends are planning this weekend" header with stacked avatars
   - Quick "I'm thinking too" button (enters planning mode)
   - Weekend-specific plans from friends
4. **User can**: Join planning mode, create a plan for Fri/Sat/Sun, or browse

---

## Technical Implementation

### 1. New Edge Function: `send-weekend-rally`
**File:** `supabase/functions/send-weekend-rally/index.ts`

Sends the Thursday push notification to all users with push enabled:
- Reuses existing web push infrastructure from `send-daily-nudge`
- Notification payload:
  ```json
  {
    "title": "What's the move this weekend? 🎉",
    "body": "See who's planning and make it happen",
    "url": "/?rally=weekend",
    "tag": "weekend-rally-2024-02-06",
    "type": "weekend_rally"
  }
  ```
- Can be triggered manually by admin or via scheduled cron job

### 2. Update Service Worker Deep Link Handling
**File:** `public/sw.js`

Add handling for the new `weekend_rally` notification type:
```javascript
} else if (notificationType === 'weekend_rally') {
  urlToOpen = '/?rally=weekend';
}
```

### 3. New Hook: `useWeekendRally`
**File:** `src/hooks/useWeekendRally.ts`

Parses `?rally=weekend` URL param and manages weekend-filtered state:
- Detects rally param on app open
- Clears param from URL after processing
- Returns `{ isWeekendRally, clearRally }` for conditional rendering

### 4. Update Plans Feed for Weekend Filter
**File:** `src/components/PlansFeed.tsx`

When `isWeekendRally` is active:
- Add "This Weekend" header banner with dynamic friend count
- Filter plans to only show Fri/Sat/Sun (next 3 days or this Fri-Sun)
- Show enhanced "I'm thinking too" CTA with weekend context
- Add weekend-specific empty state: "No weekend plans yet — be the first!"

### 5. Update Home Page Integration
**File:** `src/pages/Home.tsx`

- Import and use `useWeekendRally` hook
- When `isWeekendRally` is true:
  - Auto-switch to Plans tab
  - Pass `weekendFilter` prop to `PlansFeed`

### 6. Supabase Config Update
**File:** `supabase/config.toml`

Register the new edge function:
```toml
[functions.send-weekend-rally]
verify_jwt = true
```

### 7. Database: Cron Job for Automatic Thursday Sends
**SQL (run via Cloud Run SQL):**

Schedule the edge function to run every Thursday at 4pm (adjust timezone):
```sql
select cron.schedule(
  'weekend-rally-thursday',
  '0 23 * * 4', -- 4pm PT = 11pm UTC on Thursday
  $$
  select net.http_post(
    url:='https://nkjdthjpqomfsqyzfwbj.supabase.co/functions/v1/send-weekend-rally',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## UI Changes

### Weekend Rally Header (in PlansFeed when rally=weekend)
```
┌─────────────────────────────────────────┐
│ 🎉  This Weekend                        │
│ 4 friends are making plans              │
│ [I'm thinking too →]                    │
└─────────────────────────────────────────┘
```

### Enhanced "Planning Tonight" → "Planning This Weekend"
When in weekend rally mode:
- Section header changes to "🎉 This Weekend"
- Shows friends planning for any day Fri-Sun
- Date pills on each friend row (Fri, Sat, Sun)

---

## Files to Create
1. `supabase/functions/send-weekend-rally/index.ts` — Edge function for Thursday push

## Files to Modify
1. `public/sw.js` — Add `weekend_rally` notification type handling
2. `src/hooks/useWeekendRally.ts` — New hook for weekend rally state (create)
3. `src/components/PlansFeed.tsx` — Add weekend filter mode + UI
4. `src/pages/Home.tsx` — Integrate weekend rally hook, auto-switch to plans tab
5. `supabase/config.toml` — Register new edge function

---

## Edge Cases

1. **User opens rally link on non-Thursday**: Still works, shows weekend plans
2. **No friends planning**: Show motivating empty state + prominent "I'm thinking too"
3. **Already in planning mode**: Show confirmation, don't duplicate entry
4. **Weekend already passed (Sunday night)**: Filter shows next weekend instead

---

## Success Metrics

- **Thursday notification tap rate**: Target 15%+ CTR
- **Planning mode entries on Thursday**: Track via existing `night_statuses`
- **Weekend check-in retention**: Compare users who engage with rally vs. those who don't

