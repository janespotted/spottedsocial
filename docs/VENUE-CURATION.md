# NYC discovery edit

Explore defaults to **For you** in NYC, with **All spots** and **Saved** alongside it. The initial edit is a reviewed selection of eight cocktail bars and dance venues, not an automated web-consensus score. The full catalog is searchable and is not itself an endorsement. LA defaults to All spots until it has its own reviewed edit.

## Evidence and relevance

`mobile/src/lib/venue-picks.json` holds exact production venue ids, names, category, neighborhood, two short tags, a reason, visit guidance, review dates and source links. Each pick needs a current official venue site and independent editorial coverage. Sources checked for this launch edit include The Infatuation, Resident Advisor and Time Out. Official sites establish the venue identity and operating information; their existence is not independent evidence of popularity.

The eight picks are Temple Bar, Public Records, Katana Kitten, Gabriela, Double Chicken Please, Nowadays, Attaboy and Elsewhere. Sip & Guzzle is excluded from this editorial selection at Jane’s request. It remains searchable, saveable and eligible for ordinary venue interactions. No conclusion about its quality is inferred from that editorial exclusion.

The default order deliberately alternates cocktails and dancing. Saved reviewed venues can prioritize the member’s saved neighborhoods and styles. Only that member’s own wishlist is read; there is no friends-location query, cross-account preference inference, invented attendance, aggregate score or live trend claim. Recommendations require both the reviewed id and matching catalog name, and ignore demo venues. Stale, mismatched or unavailable records cannot fall back to arbitrary catalog entries.

## Home and venue detail

An empty nighttime feed shows actual friends’ Out / TBD information when available, a three-card For tonight strip, then a compact Post action. New members see Find your people first. A populated feed shows posts first and recommendations after the final page. Existing audience restrictions remain intact.

Each venue offers a compact **Why this spot** disclosure with the reason, visit guidance, source links and review date. This also clarifies that the edit is not a live crowd ranking. A Spotted pick label is tied to a valid reviewed pick, not a legacy map-promotion flag. Reviewed categories take precedence over inaccurate catalog categories in this disclosure/card.

For tonight offers planning suggestions, not confirmed opening, capacity, event admission or availability. Club visitors must check the official event/lineup; cocktail venue reservations and hours can change. Do not add “open now,” “busy tonight,” “trending,” or numbered top rankings without separate current supporting data. Photos use the existing venue-photo service, with a neutral category fallback if unavailable.

## Refresh process

Reviewed October 11, 2026. This edit expires at **November 10, 2026, 00:00 UTC**. At expiry, featured claims and recommendations disappear; All spots and Saved remain available. Search, detail and Home share the same eligibility rules.

Before that deadline, recheck every official venue page, closures, editorial evidence, exact address/identity and category. Reassess scene fit, then update the manifest and review dates in a reviewed app change. A refresh currently requires an app release; no automatic scraping, background schedule, admin curation console or remote content rollout is installed. Expiry is intentional and must not be extended without review. A future remote curation workflow should retain approval, evidence, exclusions and expiry, rather than exposing raw search results as endorsements.

## Validation

Run the mobile test suite and TypeScript. The recommendation cases cover evidence/expiry/city gates, exclusions, id/name mismatch, duplicate rows, deterministic own-save relevance, literal search, category diversity, public-only query scope, failure propagation and Home action order. Targeted native inspection uses temporary venue fixtures matching these real venue ids on spotted-ai-night-simulation, never synthetic visitor counts or production user mutations. Remove exact fixture ids and restore temporary tester state afterward.
