import editorial from './hot-spots-editorial.json';
import reviewed from './venue-picks.json';

type CatalogIdentity = { id: string; city?: string | null; google_place_id?: string | null; popularity_rank?: number | null };
const priorities = editorial.venues;

export function editorialForVenue(venue: CatalogIdentity) {
  return priorities.find(p => p.city === venue.city && (p.venueId === venue.id
    || (!!venue.google_place_id && p.googlePlaceId === venue.google_place_id)));
}

/** Explicit priorities survive scheduled popularity updates and review-card expiry.
 * Remaining reviewed venues keep their previous order; catalog rank is fallback.
 * Values depend on editorial configuration, never on which venues have activity.
 */
export function effectiveCuratedRank(venue: CatalogIdentity): number {
  const cityPriorities = priorities.filter(p => p.city === venue.city);
  const priority = editorialForVenue(venue);
  if (priority) return priority.priority;
  const previous = reviewed.filter(p => p.city === venue.city && !cityPriorities.some(v => v.venueId === p.venueId));
  const oldIndex = previous.findIndex(p => p.venueId === venue.id);
  if (oldIndex >= 0) return cityPriorities.length + oldIndex + 1;
  const fallback = venue.popularity_rank;
  return cityPriorities.length + previous.length + (fallback && fallback > 0 && fallback < 999 ? fallback : 999);
}
