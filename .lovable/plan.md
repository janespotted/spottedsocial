

# Add Demo Plans to Seed Data

## Overview
Add demo plans to the `seed-demo-data` edge function so that when you seed demo data, plans appear in the Plans Feed automatically. This will show realistic plan cards with venues, times, descriptions, and "I'm Down" reactions from demo friends.

---

## What You'll See After Implementation

When you seed demo data (NYC or LA), the Plans Feed will show:
- 8-10 demo plans from your demo friends
- Plans for the upcoming weekend (Fri/Sat/Sun)
- Variety of venues, times, and descriptions
- Some plans with "I'm Down" reactions from other demo users
- Proper visibility settings (friends/close_friends)

---

## Technical Implementation

### 1. Add Plan Templates to Edge Function
**File:** `supabase/functions/seed-demo-data/index.ts`

Add a new constant with realistic plan descriptions:
```typescript
const DEMO_PLAN_DESCRIPTIONS = [
  "Who's trying to go out tonight?",
  "Looking for a chill spot to start the night",
  "Birthday celebration! Come through 🎂",
  "Need a dance floor ASAP",
  "Pregaming at mine then hitting this place",
  "Heard the DJ tonight is insane",
  "Anyone down for a lowkey night?",
  "It's been too long, we're going OUT",
  "Rooftop vibes only 🌆",
  "Spontaneous night out, who's in?",
];
```

### 2. Generate Weekend Dates
Add a helper function to generate plan dates for the upcoming Fri/Sat/Sun:
```typescript
function getWeekendPlanDates(): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const dates: string[] = [];
  
  // Calculate days until next Friday
  const daysUntilFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (12 - dayOfWeek);
  
  // Add Friday, Saturday, Sunday
  for (let i = 0; i < 3; i++) {
    const planDate = new Date(today);
    planDate.setDate(today.getDate() + daysUntilFriday + i);
    dates.push(planDate.toISOString().split('T')[0]); // YYYY-MM-DD format
  }
  
  return dates;
}
```

### 3. Insert Demo Plans
After creating night statuses and check-ins, add plan creation:
```typescript
// Create demo plans
console.log('Creating demo plans...');
const weekendDates = getWeekendPlanDates();
const planTimes = ['20:00', '21:00', '21:30', '22:00', '22:30', '23:00'];
const demoPlans = [];

// Create 8-10 plans from random demo users
const planCreators = getRandomItems(demoUserIds, 10);
for (let i = 0; i < planCreators.length; i++) {
  const creatorId = planCreators[i];
  const venue = SELECTED_VENUES[Math.floor(Math.random() * Math.min(20, SELECTED_VENUES.length))];
  const venueId = venueIdMap.get(venue.name);
  const planDate = weekendDates[Math.floor(Math.random() * weekendDates.length)];
  const planTime = planTimes[Math.floor(Math.random() * planTimes.length)];
  const description = DEMO_PLAN_DESCRIPTIONS[Math.floor(Math.random() * DEMO_PLAN_DESCRIPTIONS.length)];
  
  // Calculate expires_at (end of plan_date day at 5am next morning)
  const expiresAt = new Date(planDate + 'T05:00:00');
  expiresAt.setDate(expiresAt.getDate() + 1);
  
  demoPlans.push({
    user_id: creatorId,
    venue_id: venueId,
    venue_name: venue.name,
    plan_date: planDate,
    plan_time: planTime,
    description: description,
    visibility: Math.random() > 0.3 ? 'friends' : 'close_friends',
    expires_at: expiresAt.toISOString(),
    created_at: getRecentTimestamp(12), // Within last 12 hours
    is_demo: true,
    score: 0,
    comments_count: 0,
  });
}

const { data: insertedPlans, error: plansError } = await supabaseAdmin
  .from('plans')
  .insert(demoPlans)
  .select('id, user_id');

if (plansError) {
  console.error('Error inserting plans:', plansError);
} else {
  console.log(`Created ${insertedPlans?.length || 0} demo plans`);
}
```

### 4. Add "I'm Down" Reactions
Create plan_downs entries so some plans show friend engagement:
```typescript
// Add "I'm Down" reactions to plans
if (insertedPlans && insertedPlans.length > 0) {
  const planDowns = [];
  
  for (const plan of insertedPlans) {
    // 60% of plans get 1-4 "I'm Down" reactions
    if (Math.random() < 0.6) {
      const numDowns = 1 + Math.floor(Math.random() * 4);
      const downUsers = getRandomItems(
        demoUserIds.filter(id => id !== plan.user_id),
        numDowns
      );
      
      for (const downUserId of downUsers) {
        planDowns.push({
          plan_id: plan.id,
          user_id: downUserId,
          created_at: getRecentTimestamp(6),
        });
      }
    }
  }
  
  if (planDowns.length > 0) {
    await supabaseAdmin.from('plan_downs').insert(planDowns);
    console.log(`Created ${planDowns.length} "I'm Down" reactions`);
  }
}
```

### 5. Clean Up Demo Plans on Re-Seed
Add cleanup logic at the beginning of the seed function:
```typescript
// Delete demo plan data
await supabaseAdmin.from('plan_downs').delete().in('plan_id', 
  (await supabaseAdmin.from('plans').select('id').eq('is_demo', true)).data?.map(p => p.id) || []
);
await supabaseAdmin.from('plan_comments').delete().in('plan_id',
  (await supabaseAdmin.from('plans').select('id').eq('is_demo', true)).data?.map(p => p.id) || []
);
await supabaseAdmin.from('plans').delete().eq('is_demo', true);
```

---

## Files to Modify

1. `supabase/functions/seed-demo-data/index.ts`
   - Add `DEMO_PLAN_DESCRIPTIONS` constant
   - Add `getWeekendPlanDates()` helper function
   - Add cleanup for existing demo plans
   - Add plan creation logic after check-ins
   - Add "I'm Down" reaction creation

---

## Demo Data Stats After Implementation

| Content Type | Count |
|-------------|-------|
| Demo Users | 50 |
| Venues | 40 |
| Posts | 60 |
| **Plans** | **10** (NEW) |
| Yaps | 20 |
| Reviews | ~100 |

---

## Testing

After implementation:
1. Go to Demo Settings
2. Tap "Seed NYC Data" or "Seed LA Data"
3. Navigate to Feed → Plans tab
4. You should see 8-10 plan cards from demo friends
5. Some will have "X friends are down" indicators
6. Tapping "I'm Down" on a plan should work normally

