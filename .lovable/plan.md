
# Complete Events Ecosystem Implementation

## Overview
Build out a full events system with four entry points for adding events:
1. **Demo Seeding** - Automated test data with friend RSVPs
2. **Business Dashboard** - Venue owners can add their events
3. **Admin Panel** - Curated events for any venue
4. **User-Generated** - Let users add events they're going to

---

## Current State

**Database is Ready:**
- `events` table exists with all needed columns: id, venue_id, venue_name, title, description, event_date, start_time, end_time, cover_image_url, ticket_url, city, neighborhood, expires_at
- `event_rsvps` table tracks user RSVPs with type (interested | going)

**UI Components Exist:**
- `EventCard.tsx` - Displays events with friend RSVPs and "I'm Down" button
- `PlansFeed.tsx` - Integrates events into the feed (friend-filtered)

**The Gap:**
- Events table is empty (0 rows)
- No way to create events in the app
- Not included in demo data seeding

---

## Implementation Plan

### Phase 1: Demo Event Seeding

**File:** `supabase/functions/seed-demo-data/index.ts`

Add event seeding with these realistic templates:

```typescript
const DEMO_EVENTS = [
  { title: "Friday Night DJ Set", description: "House music all night", time: "22:00" },
  { title: "Industry Night", description: "Free entry for hospitality workers", time: "21:00" },
  { title: "Saturday Night Live DJ", description: "Special guest DJ set", time: "23:00" },
  { title: "Rooftop Sessions", description: "Sunset vibes into the night", time: "19:00" },
  { title: "Disco Sundays", description: "Classic disco and funk", time: "20:00" },
];
```

**Logic:**
1. Generate weekend dates (Fri/Sat/Sun)
2. Create ~8 events at top venues
3. Add demo user RSVPs so events surface in friend-filtered feed
4. Include cleanup for `is_demo` events on re-seed

**Schema Update Required:**
Add `is_demo` column to events table for cleanup:
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
```

---

### Phase 2: Business Event Creation

**New File:** `src/pages/business/BusinessEvents.tsx`

Create an events management page for venue owners:
- List of their venue's events
- "Add Event" button opens a creation form
- Edit/delete existing events

**New File:** `src/components/business/CreateEventDialog.tsx`

Event creation form with:
- Title (required)
- Date picker (required)
- Start time (required)
- End time (optional)
- Description (optional)
- Cover image upload (optional)
- Ticket URL (optional)

**Update:** `src/pages/business/BusinessDashboard.tsx`

Add "Events" button to "Grow Your Venue" section:
```tsx
<Button onClick={() => navigate('/business/events')}>
  <Calendar className="h-4 w-4 text-primary" />
  <span>Events</span>
  <span>Add & manage your venue events</span>
</Button>
```

**Update:** `src/App.tsx`

Add route: `/business/events` -> `BusinessEvents.tsx`

---

### Phase 3: Admin Events Panel

**New File:** `src/components/admin/EventsPanel.tsx`

Admin panel for curating events across all venues:
- Search and select any venue
- Create events for any venue (curation)
- List all events with edit/delete
- Filter by city (NYC/LA/PB)

**Update:** `src/pages/Admin.tsx`

Add "Events" tab to the existing tabs:
```tsx
<TabsTrigger value="events">
  <Calendar className="h-3 w-3 mr-1" />
  Events
</TabsTrigger>

<TabsContent value="events">
  <EventsPanel />
</TabsContent>
```

---

### Phase 4: User-Generated Events

**New File:** `src/components/CreateEventDialog.tsx`

Allow users to add events they're going to:
- Similar to CreatePlanDialog flow
- User selects a venue
- Fills in event details
- Automatically RSVPs as "going"
- Event surfaces to their friends

**Update:** `src/components/PlansFeed.tsx`

Add "Add Event" button alongside "Create Plan":
- Only show when there are few/no events in feed
- Opens CreateEventDialog

**RLS Policy for User Events:**
```sql
-- Users can create events (but not is_demo ones)
CREATE POLICY "Users can create events" ON events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND is_demo = false);
```

---

## Database Changes

```sql
-- Add is_demo flag for cleanup
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Add created_by to track who added the event
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- RLS: Venue owners can manage their events
CREATE POLICY "Venue owners can manage events" ON events
  FOR ALL TO authenticated
  USING (
    venue_id IS NOT NULL AND 
    public.is_venue_owner(auth.uid(), venue_id)
  );

-- RLS: Admins can manage all events
CREATE POLICY "Admins can manage all events" ON events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Users can create events
CREATE POLICY "Users can create events" ON events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    (is_demo = false OR is_demo IS NULL)
  );

-- RLS: Anyone can view non-expired events
CREATE POLICY "Anyone can view events" ON events
  FOR SELECT TO authenticated
  USING (expires_at > now());
```

---

## File Summary

### New Files (6 total)
| File | Purpose |
|------|---------|
| `src/pages/business/BusinessEvents.tsx` | Venue owner events management |
| `src/components/business/CreateEventDialog.tsx` | Business event creation form |
| `src/components/admin/EventsPanel.tsx` | Admin event curation panel |
| `src/components/CreateEventDialog.tsx` | User-generated event creation |

### Modified Files (4 total)
| File | Changes |
|------|---------|
| `supabase/functions/seed-demo-data/index.ts` | Add demo events + RSVPs |
| `src/pages/business/BusinessDashboard.tsx` | Add Events button |
| `src/pages/Admin.tsx` | Add Events tab |
| `src/App.tsx` | Add business events route |

---

## User Flow Summary

```
Demo Mode:
Seed Data → Events auto-created → Demo users RSVP → Events appear in Plans Feed

Business Portal:
Venue Owner → Dashboard → Events → Add Event → Appears in Plans Feed for friends

Admin Panel:
Admin → Events Tab → Select Venue → Create Event → Curated event appears

User-Generated:
User → Plans Feed → Add Event → Select Venue → Fill Details → Auto-RSVPs → Friends see event
```

---

## Testing After Implementation

1. **Demo seeding**: Go to Demo Settings → Seed LA Data → Check Plans Feed for events
2. **Business events**: Log in as venue owner → Dashboard → Events → Add event → Verify in feed
3. **Admin events**: Go to Admin → Events tab → Create event for venue → Verify in feed
4. **User events**: Go to Plans Feed → Add Event → Create → Friends should see it
