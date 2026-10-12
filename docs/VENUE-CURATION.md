# NYC nightlife discovery

Explore defaults to **For you** in NYC; **All spots** and **Saved** remain searchable. This is an expiring editorial edit of clubs and lively social bars, anchored by Gospel. It is not a measured online buzz ranking. LA defaults to its catalog.

## Selection and evidence

The six picks are Gospel, Gabriela, Joyface, Le Bain, The Flower Shop and Nowadays. Cocktail-led lounges have been removed from the featured edit. Sip & Guzzle stays excluded from recommendations while remaining searchable.

`mobile/src/lib/venue-picks.json` stores exact production ids and names, club/bar category, area, short tags, editorial context, review dates, and official/editorial links. NYLON covers Gospel’s music-led scene; The Infatuation’s June 2026 East Village guide supports Joyface; Resident Advisor’s February 2026 club guide covers Gabriela and Nowadays; Time Out documents Le Bain’s DJ programming; The Infatuation reviews The Flower Shop’s basement bar. Official sites were checked on October 11, 2026. Some editorial coverage is older: the selection must not be advertised as real-time consensus or current attendance. Official sites establish identity and operations, not independent popularity.

Why this spot and its source accordion are removed from the consumer UI at Jane’s request. Evidence stays in the manifest for internal review. The venue sheet can show **Here last night** using the viewer’s existing, unexpired recap of overlapping shared visits. It only shows direct friends returned by the existing authorized RPC, exact venue ids, the immediately preceding night, and no timestamps. Current sharing, hidden-location and block controls are rechecked server-side. Relationship invalidation clears cached rows; the UI clears expired recaps. It does not retain new history, expose mutuals’ past visits, or suggest that a past visitor is present now. A broader friends/mutuals visit history needs a separately designed opt-in retention feature.

The member’s own saved areas/styles can reorder current picks. Discovery itself makes no friends-location queries. Expired, wrong-city, demo, missing or mismatched venue records cannot fall back to arbitrary endorsements. Home shows at most three distinct picks, mixing clubs and bars when both exist.

## Empty Home

An empty nighttime feed shows existing friends’ activity, a compact Plans preview, nightlife picks, then Post. The preview uses the same audience-filtered plans query as Chat, shows at most two plans (tonight first, otherwise nearest future dates), and routes to `/messages?tab=plans`. Every preview row and See all opens Plans; an empty result offers a single Make a plan shortcut. Loading and errors remain distinct. Realtime and pull-to-refresh update plans. The Chat selection lives in the route so repeated Home links work after switching to DMs. Populated Home keeps posts first; it does not insert the plan preview into the feed.

## Refresh procedure

Review deadline: **November 10, 2026**. Recheck operations, independent coverage, venue identity, neighborhood and suitability before extending a pick. Remove closures or unsupported picks. Updates currently ship with an app build; no automated scraping or live consensus service is represented. A future admin workflow can replace the manifest without weakening these checks.
