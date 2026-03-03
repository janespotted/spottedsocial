

## Plan: Improved Yap Notifications + Top Yap in Activity Center

### Changes

**1. `src/hooks/useYapNotifications.ts` — Fix banner trigger + format**

- Replace the 5-minute cooldown with a **once-per-check-in** flag. Track whether the user has already been notified since their current venue session started. Use a `notifiedForVenueRef` that stores the venue name — reset when venue changes.
- Change banner message format from `💬 New yap at X: "preview"` to `Yap @X "preview"`
- Same format for the DB notification message

**2. `src/components/messages/ActivityTab.tsx` — Show top yap at user's venue**

- After fetching the user's current venue from `night_statuses`, query `yap_messages` for the highest-scored non-expired yap at that venue (excluding the user's own yaps, `score` desc, limit 1)
- Add it as an activity item with type `venue_yap`, title `Top Yap @[venue]`, subtitle being the yap text preview
- This is a separate entry from the realtime yap notification — it represents the current "hot" yap

### No database changes needed

`yap_messages` already has `score`, `venue_name`, `text`, and `expires_at`.

| File | Change |
|------|--------|
| `src/hooks/useYapNotifications.ts` | Replace cooldown with once-per-venue flag; update message format to `Yap @X "preview"` |
| `src/components/messages/ActivityTab.tsx` | Fetch top-scored yap at user's current venue and add as activity item |

