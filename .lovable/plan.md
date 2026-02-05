

## Fix Venue Detection & Database Accuracy for Venice Beach

### Problem Summary

You're at **523 Ocean Front Walk** near Dudley Market, but the app detected "High Venice Rooftop" instead. This happened because:

1. **Dudley Market is NOT in the venue database** - It needs to be added
2. **High Rooftop Lounge** is an old/duplicate entry that should be renamed to **Kassi Rooftop** (they are the same venue at Hotel Erwin)
3. We already have a separate "Kassi Rooftop" entry, so "High Rooftop Lounge" should be deleted

The venue dropdown feature already exists in the app - when you're prompted "Are you out?", there's a dropdown showing nearby venues. However, it only works when there are actually multiple venues detected nearby.

---

### Database Fixes

**Step 1: Add Dudley Market**
```sql
INSERT INTO venues (name, lat, lng, neighborhood, type)
VALUES ('Dudley Market', 33.9941928, -118.4796515, 'Venice', 'wine_bar');
```
- Location: 9 Dudley Ave (near 523 Ocean Front Walk)
- Seafood restaurant and natural wine bar

**Step 2: Delete Duplicate "High Rooftop Lounge"**
```sql
DELETE FROM venues WHERE name = 'High Rooftop Lounge' AND neighborhood = 'Venice';
```
- This is the old name for Kassi Rooftop
- We already have "Kassi Rooftop" in the database at the correct Hotel Erwin location

**Step 3: Verify Other Venice Venues**

Based on research, the following venues in the database are accurate:
- Kassi Rooftop (Hotel Erwin) 
- The Brig Venice
- Venice Whaler
- Townhouse Del Monte
- The Roosterfish
- Gjelina Venice
- Canal Club Venice
- James Beach Venice

---

### How the Venue Dropdown Works (Already Implemented)

The app already has this feature. When the "Are you out?" prompt appears:

```
┌────────────────────────────────────┐
│     📍 You're near Dudley Market   │
│        Are you out?                │
│                                    │
│  Not right? Select another:        │
│  ┌────────────────────────────┐    │
│  │ 📍 Dudley Market (45m)   ▼ │    │  ← Dropdown
│  └────────────────────────────┘    │
│                                    │
│     [ Yes, I'm here! 🎉 ]          │
│                                    │
│       I'm somewhere else           │
│        Not yet • Dismiss           │
└────────────────────────────────────┘
```

The dropdown shows all venues within 500m, ordered by distance. Users can select a different venue if the auto-detected one is wrong.

---

### Files Changed

- **Database only** - No code changes needed
- The venue dropdown in `VenueArrivalPrompt.tsx` already works correctly

---

### Verification

After the database update, when you're at 523 Ocean Front Walk:
1. Dudley Market should be detected as the nearest venue (approximately 45m away)
2. The dropdown will show other nearby Venice venues (Kassi Rooftop, The Roosterfish, etc.)
3. "High Rooftop Lounge" will no longer appear (deleted duplicate)

