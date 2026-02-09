
# Auto Check-In for YC Demo Mode

## The Problem
When a YC partner signs up via the magic URL (`?demo=yc&city=nyc`), the app populates with demo users and venues, but **they** aren't checked in anywhere. This means:
- They can't test "Drop a Vibe" without manually navigating to Demo Settings
- They don't see themselves on the map
- The experience feels incomplete

## The Solution
Automatically "check in" the user at a popular NYC venue as part of the demo activation flow.

---

## Implementation

### Modify DemoActivator Component

After demo seeding completes, simulate a check-in for the user at a popular venue:

```text
Current flow:
1. Detect ?demo=yc
2. Store in localStorage
3. After auth: enable demo mode + seed data
4. Show toast

New flow:
1. Detect ?demo=yc
2. Store in localStorage
3. After auth: enable demo mode + seed data
4. Auto check-in user at a popular venue
5. Show toast mentioning the venue
```

### Venue Selection Logic

Pick a well-known venue from the seeded city:
- **NYC**: "Le Bain" (popular rooftop club in Meatpacking)
- **LA**: "Sound Nightclub" (iconic Hollywood club)
- **PB**: "Respectable Street" (famous Clematis club)

### Check-In Implementation

The check-in creates:
1. **night_statuses** record with `status: 'out'` and venue info
2. **checkins** record for tracking

This uses the same logic as `handleSimulateCheckin` in DemoSettings.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/DemoActivator.tsx` | Add auto check-in after seeding |

### Code Changes

**DemoActivator.tsx** - Add check-in after seed:

```typescript
// After successful seed, check in user at a featured venue
await simulateCheckinForDemo(userId, city);

async function simulateCheckinForDemo(userId: string, city: SupportedCity) {
  // Featured venues per city
  const featuredVenues = {
    nyc: { name: 'Le Bain', lat: 40.7414, lng: -74.0078 },
    la: { name: 'Sound Nightclub', lat: 34.0412, lng: -118.2468 },
    pb: { name: 'Respectable Street', lat: 26.7140, lng: -80.0555 }
  };
  
  const venue = featuredVenues[city];
  
  // Find venue ID from database
  const { data: venueData } = await supabase
    .from('venues')
    .select('id')
    .eq('name', venue.name)
    .single();
  
  if (!venueData) return;
  
  // Calculate expiry (5 AM next morning)
  const expiresAt = new Date();
  if (expiresAt.getHours() >= 5) expiresAt.setDate(expiresAt.getDate() + 1);
  expiresAt.setHours(5, 0, 0, 0);
  
  // Upsert night_status
  await supabase.from('night_statuses').upsert({
    user_id: userId,
    status: 'out',
    venue_id: venueData.id,
    venue_name: venue.name,
    lat: venue.lat,
    lng: venue.lng,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  
  // Create checkin record
  await supabase.from('checkins').insert({
    user_id: userId,
    venue_id: venueData.id,
    venue_name: venue.name,
    lat: venue.lat,
    lng: venue.lng,
    started_at: new Date().toISOString(),
  });
}
```

---

## Enhanced Toast Message

After activation, show:

```
"Welcome to Spotted! You're 'at' Le Bain in NYC 🎉
Explore the map, check the leaderboard, and drop a vibe!"
```

---

## What YC Partners Will Experience

1. Click `spottedsocial.lovable.app?demo=yc&city=nyc`
2. Sign up with email
3. App auto-seeds with NYC nightlife data
4. They're automatically "checked in" at Le Bain
5. They see:
   - Their avatar on the map at Le Bain
   - Themselves in the leaderboard at Le Bain
   - "Drop a Vibe" button is active when they view Le Bain's venue card
   - Demo friends "out" at other venues

---

## URL Options Summary

| URL | City | User Checked In At |
|-----|------|-------------------|
| `?demo=yc` | NYC (default) | Le Bain |
| `?demo=yc&city=nyc` | NYC | Le Bain |
| `?demo=yc&city=la` | LA | Sound Nightclub |
| `?demo=yc&city=pb` | Palm Beach | Respectable Street |
