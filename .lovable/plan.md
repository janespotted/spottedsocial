

## Full Audit: Add Missing Top NYC Venues

After cross-referencing TimeOut's "Best Bars" and "Best Clubs" lists (March 2026) plus your specific mentions, here are the venues missing from your database:

### Missing Venues to Add (~20 venues)

**Bars & Cocktail Bars:**
| Venue | Neighborhood | Type |
|---|---|---|
| ACME | NoHo | nightclub |
| People's | Greenwich Village | members_club |
| Sip & Guzzle | West Village | cocktail_bar |
| KABIN | Hudson Square | cocktail_bar |
| Bar Blondeau | Williamsburg | rooftop |
| Golden Ratio | Clinton Hill | cocktail_bar |
| Sauced | Williamsburg | bar |
| Nothing Really Matters | Midtown | speakeasy |
| Grand Army | Boerum Hill | cocktail_bar |
| Katana Kitten | West Village | cocktail_bar |
| Sweet Afton | Astoria | bar |
| Bar Kabawa | East Village | cocktail_bar |
| Harlem Hops | Harlem | bar |
| Seed Library | Midtown East | cocktail_bar |

**Clubs & Music Venues:**
| Venue | Neighborhood | Type |
|---|---|---|
| Animal | Greenpoint | club |
| Desert 5 Spot | Williamsburg | bar |
| C'mon Everybody | Bed-Stuy | club |

### Already in Database (no action needed)
ACME-related: none (needs adding). Already present: Superbueno, Saint Tuesday, schmuck., Sunken Harbor Club, Dear Irving NYC, Bar Madonna, Sultan Room, Nowadays, The Delancey, and all the classics (Dead Rabbit, Attaboy, Death & Co, Bemelmans, etc.)

### Implementation
1. **Database insert**: Use Google Places API geocoding (via the existing `geocode-venues-csv.js` pattern) or manual coordinates from Google Maps to get accurate lat/lng for each venue
2. **Popularity ranks**: Assign ranks 5-15 range so they appear in the leaderboard rotation but don't displace existing top spots
3. **Single SQL insert** via the insert tool with all ~20 venues, each with accurate coordinates, neighborhood, type, and city = 'nyc'

### Notes
- **ACME** (9 Great Jones St, NoHo) — nightclub/restaurant with DJ sets Thu-Sat
- **People's** (Greenwich Village) — exclusive invite-only evening club, categorized as `members_club`
- All venues will have `is_demo = false` and appropriate popularity ranks

