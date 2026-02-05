

## Friend-Filtered Events Integration (B + C)

### Core Principle
Events only surface when friends are interested - no event discovery, only social signals.

---

### Phase 1: Database Schema

Create two new tables:

**`events` table:**
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| venue_id | UUID | Links to venues table |
| venue_name | TEXT | Venue display name |
| title | TEXT | Event name |
| description | TEXT | Optional details |
| event_date | DATE | When it happens |
| start_time | TIME | Start time |
| end_time | TIME | Optional end time |
| cover_image_url | TEXT | Event image |
| ticket_url | TEXT | External ticketing link |
| city | TEXT | For filtering |
| neighborhood | TEXT | For filtering |
| created_at | TIMESTAMPTZ | Creation timestamp |
| expires_at | TIMESTAMPTZ | Auto-cleanup |

**`event_rsvps` table:**
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| event_id | UUID | Foreign key to events |
| user_id | UUID | Who RSVP'd |
| rsvp_type | TEXT | 'interested' or 'going' |
| created_at | TIMESTAMPTZ | When they RSVP'd |
| UNIQUE(event_id, user_id) | | One RSVP per user per event |

**RLS Policies:**
- Events: readable by all authenticated users
- RSVPs: users can manage own, read friends'

---

### Phase 2: EventCard Component

Create `src/components/EventCard.tsx` - visually distinct from PlanItem:

**Visual Design:**
- Subtle gradient background (different from plan cards)
- Small "EVENT" pill/tag in corner
- Cover image with overlay
- Friend avatars prominently displayed (same pattern as plans)
- "I'm Down" button (same UX as plans for consistency)

**Layout:**
```
+------------------------------------------+
| EVENT                    [Share] [Ticket]|
| [Cover Image with gradient overlay]      |
| "DJ Night at The Rooftop"                |
| Sat, Jan 27 at 10PM                      |
| (avatar)(avatar)(avatar) 3 friends going |
| [I'm Down]                               |
+------------------------------------------+
```

**Key behavior:**
- Venue name tappable (opens VenueIdCard)
- Friend avatars tappable (opens FriendIdCard)
- "I'm Down" triggers same haptic/confetti as plans

---

### Phase 3: Integrate Events into PlansFeed

Modify `src/components/PlansFeed.tsx`:

1. **Fetch events with friend RSVPs:**
   - Query events for today/upcoming
   - Join with event_rsvps to count friend interest
   - Only include events where >= 1 friend has RSVP'd

2. **Merge and sort:**
   - Combine plans and friend-filtered events
   - Sort by: friend count (desc), then date (asc)
   - Events interleave naturally with plans

3. **Empty state unchanged:**
   - If no plans AND no friend-attended events, show current empty state
   - Events alone don't trigger display (no discovery mode)

**Feed items array becomes:**
```typescript
type FeedItem = 
  | { type: 'plan'; data: Plan }
  | { type: 'event'; data: Event; friendsInterested: number };

// Render logic
feedItems.map(item => 
  item.type === 'plan' 
    ? <PlanItem ... />
    : <EventCard ... />
)
```

---

### Phase 4: Events in VenueIdCard More Info

Add "Upcoming Events" section in the More Info collapsible:

**Location:** Inside `CollapsibleContent`, after "Tonight's Buzz"

**Display logic:**
1. Query events for this venue_id
2. Show only if events exist
3. Friend-first display: "2 friends interested" with avatars
4. Minimal event info: title, date, time

**UI snippet:**
```
+----------------------------------+
| Upcoming Events                  |
| +------------------------------+ |
| | "DJ Night"                   | |
| | Sat 10PM                     | |
| | (av)(av) 2 friends interested| |
| | [I'm Down]                   | |
| +------------------------------+ |
+----------------------------------+
```

---

### Files to Create/Modify

| File | Action |
|------|--------|
| Database migration | Create `events` and `event_rsvps` tables |
| `src/components/EventCard.tsx` | NEW - Event card component |
| `src/components/PlansFeed.tsx` | Fetch and merge events, render EventCard |
| `src/components/VenueIdCard.tsx` | Add "Upcoming Events" in More Info |

---

### What This Avoids

- No new navigation tab (keeps 5-tab nav clean)
- No Eventbrite-style discovery browse
- No events without friend context
- Maintains spontaneous feel - events surface because friends are interested, not because algorithm recommends them

---

### Future Considerations (Not in This Phase)

- Notifications when friends RSVP to events
- Weekend nudge: "3 events your friends are eyeing this weekend"
- Event creation by users (currently assumes events are seeded/imported)

