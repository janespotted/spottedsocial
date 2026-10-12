# NYC nightlife discovery

Explore defaults to **For you** in NYC; **All spots** and **Saved** remain searchable. This is an expiring editorial edit of clubs and lively social bars, anchored by Gospel. It is not a measured online buzz ranking. LA defaults to its catalog.

## Selection and evidence

The six picks are Gospel, Gabriela, Joyface, Le Bain, The Flower Shop and Nowadays. Cocktail-led lounges have been removed from the featured edit. Sip & Guzzle stays excluded from recommendations while remaining searchable.

`mobile/src/lib/venue-picks.json` stores exact production ids and names, club/bar category, area, short tags, editorial context, review dates, and official/editorial links. NYLON covers Gospel’s music-led scene; The Infatuation’s June 2026 East Village guide supports Joyface; Resident Advisor’s February 2026 club guide covers Gabriela and Nowadays; Time Out documents Le Bain’s DJ programming; The Infatuation reviews The Flower Shop’s basement bar. Official sites were checked on October 11, 2026. Some editorial coverage is older: the selection must not be advertised as real-time consensus or current attendance. Official sites establish identity and operations, not independent popularity.

Why this spot and its source accordion are removed from the consumer UI at Jane’s request. Evidence stays in the manifest for internal review. Recommendation cards have no descriptive sentence. Venue sheets and cards show **Friends who visited recently** with tappable profile photos only when the server returns an authorized visit.

New venue visits retain a venue id and a frozen audience for 90 days, without coordinates. The server captures viewers permitted at the first live sharing moment, including permitted mutuals. Friendship or broader sharing established later cannot add viewers to an old visit. Current friendship, sharing, hidden-location and block controls are also rechecked on every read. The row only shows completed visits, is hidden when empty, and never implies current attendance. No historical records are backfilled from today's relationships. Raw coordinate-bearing checkins retain the existing 30-day cleanup; cross-user raw reads are restricted to currently shared, active checkins. Deleting an owned checkin withdraws its history; scheduled raw cleanup preserves the private venue memory until expiry. The daily history cleanup removes expired records and audiences.

The member’s own saved areas/styles can reorder current picks. The separate social row uses `get_recent_venue_visits`, never raw historical location reads. Expired, wrong-city, demo, missing or mismatched venue records cannot fall back to arbitrary endorsements. Home shows at most three distinct picks, mixing clubs and bars when both exist. More Info starts collapsed for every venue.

## Empty Home

An empty nighttime feed shows existing friends’ activity, a compact Plans preview and nightlife picks. A bright yellow Post button stays at bottom-left whether the feed is populated or empty (hidden only while typing with the keyboard open). The preview uses the same audience-filtered plans query as Chat, shows at most two plans (tonight first, otherwise nearest future dates), and routes to `/messages?tab=plans`. The venue and See all open Plans; friend names/photos open Friend ID without opening the parent row. An empty result offers a single Make a plan shortcut. Loading and errors remain distinct. Realtime and pull-to-refresh update plans. The Chat selection lives in the route so repeated Home links work after switching to DMs. Populated Home keeps posts first; it does not insert the plan preview into the feed.

## Nighttime ranking

Night Leaderboard always numbers its organic venue list, including venues with zero checkins. Scores combine a normalized curated seed with normalized real checkins. The initial mix is 70% curated / 30% real through 20 unique, viewer-visible city checkins. Real activity rises linearly to 90% at 200 checkins, overtaking curated weight above 80. This scales with the visible city network's activity, not total registered app users. Neighborhood filters apply after ranking and never change the weights. Promoted cards remain separate and unranked. The app does not invent attendance, visitors or trends to fill an empty city.

## Refresh procedure

Review deadline: **November 10, 2026**. Recheck operations, independent coverage, venue identity, neighborhood and suitability before extending a pick. Remove closures or unsupported picks. Updates currently ship with an app build; no automated scraping or live consensus service is represented. A future admin workflow can replace the manifest without weakening these checks.
