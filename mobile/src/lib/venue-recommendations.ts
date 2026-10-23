import picks from './venue-picks.json';
import type { DiscoveryVenue } from './venue-discovery';

export type VenuePick = (typeof picks)[number];
export type RecommendedVenue = DiscoveryVenue & { pick: VenuePick; relevance: string | null };
// Editorial exclusions do not remove the venue from search, saved lists or check-in.
const EXCLUDED_IDS = new Set(['f8533b52-9128-46f6-9611-7d2c78d9fc06']); // Sip & Guzzle: client editorial decision.

/** Unreviewed, expired or incomplete picks must never silently become endorsements. */
export function currentPicks(city: string, now = Date.now()): VenuePick[] {
  return picks.filter(p => p.city === city && !EXCLUDED_IDS.has(p.venueId)
    && now >= Date.parse(`${p.reviewedAt}T00:00:00Z`) && now < Date.parse(`${p.reviewBy}T00:00:00Z`)
    && p.sources.some(s => s.kind === 'official' && s.url.startsWith('https://'))
    && p.sources.some(s => s.kind === 'editorial' && s.url.startsWith('https://')));
}

export function pickForVenue(id: string, city: string, name: string, now = Date.now()) {
  return currentPicks(city, now).find(p => p.venueId === id && p.name === name);
}

/** A reviewed edit, lightly reordered by the member's own saves. No crowd score or live claim. */
export function rankRecommendations(venues: DiscoveryVenue[], city: string, savedNames: string[] = [], search = '', now = Date.now()): RecommendedVenue[] {
  const reviewed = currentPicks(city, now);
  const saved = new Set(savedNames);
  const savedPicks = reviewed.filter(p => saved.has(p.name));
  const neighborhoods = new Set(savedPicks.map(p => p.neighborhood));
  const categories = new Set(savedPicks.map(p => p.category));
  const byId = new Map(venues.map(v => [v.id, v]));
  const term = search.trim().toLocaleLowerCase();
  return reviewed.flatMap((pick, order) => {
    const venue = byId.get(pick.venueId);
    // An id/name mismatch can signal a replaced or mistaken catalog record. Fail closed.
    if (!venue || venue.name !== pick.name || (term && ![venue.name, pick.neighborhood, ...pick.tags].join(' ').toLocaleLowerCase().includes(term))) return [];
    const inSavedArea = neighborhoods.has(pick.neighborhood);
    const inSavedStyle = categories.has(pick.category);
    const relevance = !saved.has(venue.name) && inSavedArea ? 'Around your saved spots' : !saved.has(venue.name) && inSavedStyle ? 'A style you’ve saved' : null;
    return [{ ...venue, pick, relevance, score: (inSavedArea ? 2 : 0) + (inSavedStyle ? 1 : 0), order }];
  }).sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ score, order, ...venue }) => venue);
}

/** Three suggestions, with both clubs and bars represented when available. */
export function tonightRecommendations(rows: RecommendedVenue[]): RecommendedVenue[] {
  if (rows.length <= 3) return rows;
  const first = rows[0];
  const other = rows.find(v => v.pick.category !== first.pick.category);
  const result = other ? [first, other] : [first];
  for (const row of rows) if (result.length < 3 && !result.some(v => v.id === row.id)) result.push(row);
  return result;
}
