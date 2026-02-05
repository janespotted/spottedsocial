
## Add Missing LA Venues & Clean Up Closed Venues

### Summary
Add 5 key missing LA nightlife venues (including Kiss Kiss Bang Bang and other hot spots from 2024-2025) and remove permanently closed venues to maintain data quality.

### Venues to Add

| Venue | Neighborhood | Type | Address | Coordinates |
|-------|--------------|------|---------|-------------|
| Kiss Kiss Bang Bang | Koreatown | nightclub | 3531 Wilshire Blvd (The LINE LA) | 34.0615, -118.3060 |
| Zouk LA | West Hollywood | nightclub | 643 N La Cienega Blvd | 34.0823, -118.3765 |
| Galerie on Sunset | West Hollywood | lounge | 8226 W Sunset Blvd | 34.0917, -118.3724 |
| Andy's | West Hollywood | lounge | 9077 Santa Monica Blvd | 34.0901, -118.3889 |
| Level 8 | Downtown LA | bar | 1254 S Figueroa St (Moxy Hotel) | 34.0412, -118.2665 |

### Venues to Remove (Permanently Closed)

Based on cross-referencing with current LA nightlife sources (LA Guide 2026, TimeOut, etc.):

| Venue | Reason |
|-------|--------|
| Bootsy Bellows WeHo | Permanently closed (confirmed by multiple sources) |
| Nightingale Plaza | Closed - replaced by Zouk LA at same address |

### Data Quality Cleanup

Remove duplicates to keep cleaner venue data:
- Keep "Good Times at Davey Wayne's" (official name), remove "Davey Wayne's Basement" and "Davey Wayne's Hollywood"
- Verify and consolidate other duplicates as needed

---

### Technical Details

**Database migration:**

```sql
-- 1. Add new venues
INSERT INTO venues (name, city, neighborhood, type, lat, lng, is_demo, is_leaderboard_promoted, is_map_promoted)
VALUES 
  ('Kiss Kiss Bang Bang', 'la', 'Koreatown', 'nightclub', 34.0615, -118.3060, false, false, false),
  ('Zouk LA', 'la', 'West Hollywood', 'nightclub', 34.0823, -118.3765, false, false, false),
  ('Galerie on Sunset', 'la', 'West Hollywood', 'lounge', 34.0917, -118.3724, false, false, false),
  ('Andy''s', 'la', 'West Hollywood', 'lounge', 34.0901, -118.3889, false, false, false),
  ('Level 8', 'la', 'Downtown LA', 'bar', 34.0412, -118.2665, false, false, false);

-- 2. Remove permanently closed venues
DELETE FROM venues WHERE name = 'Bootsy Bellows WeHo' AND city = 'la';
DELETE FROM venues WHERE name = 'Nightingale Plaza' AND city = 'la';

-- 3. Clean up duplicates (keep official names)
DELETE FROM venues WHERE name = 'Davey Wayne''s Basement' AND city = 'la';
DELETE FROM venues WHERE name = 'Davey Wayne''s Hollywood' AND city = 'la';
```

### New Venue Details

**Kiss Kiss Bang Bang**
- Disco-Deco nightclub at The LINE Hotel by Houston Brothers
- Thursday-Saturday, 9:30pm-2am
- Music: Disco, Dance, House

**Zouk LA**
- 16,500 sq ft nightclub collaboration between Zouk Group and sbe
- Took over former Nightingale Plaza in early 2025
- Friday & Saturday nights

**Galerie on Sunset**
- New supper club/lounge on Sunset Strip (replaced The Den on Sunset)
- Club hours Thursday-Saturday
- Music: Dance, House, Hip Hop

**Andy's**
- Anderson .Paak's live music venue with Houston Brothers
- R&B and jazz focused
- Secret entrance behind a newsstand

**Level 8**
- 30,000 sq ft Vegas-style complex at Moxy Hotel DTLA
- Multiple concepts including Sinners y Santos (already in DB)
- Near Crypto.com Arena

### Result
- Total LA venues: ~317 (up from ~314)
- Removed 4 closed/duplicate venues
- Added 5 current hot spots
- Improved data quality and accuracy
