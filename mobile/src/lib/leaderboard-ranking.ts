/** Curated seed at launch; measured activity takes over as the city's visible network grows. */
export function leaderboardWeights(uniqueCheckins: number) {
  const activity = Math.max(0, Number.isFinite(uniqueCheckins) ? uniqueCheckins : 0);
  // Keep 70/30 through the first 20 check-ins; reach 10/90 at 200.
  const live = 0.3 + 0.6 * Math.min(1, Math.max(0, (activity - 20) / 180));
  return { curated: 1 - live, live };
}

export function rankNightlife<T extends { venue_id: string | null; venue_name: string; popularity_rank: number; count: number }>(venues: T[], uniqueCheckins: number) {
  const weights = leaderboardWeights(uniqueCheckins);
  const maxCount = Math.max(1, ...venues.map(v => Math.max(0, v.count)));
  const seed = (v: T) => v.popularity_rank > 0 && v.popularity_rank < 999
    ? 1 / (1 + (v.popularity_rank - 1) / 10) : 0;
  const score = (v: T) => weights.curated * seed(v)
    + weights.live * Math.log1p(Math.max(0, v.count)) / Math.log1p(maxCount);
  return [...venues].sort((a, b) => score(b) - score(a) || seed(b) - seed(a)
    || b.count - a.count || a.venue_name.localeCompare(b.venue_name)
    || (a.venue_id ?? '').localeCompare(b.venue_id ?? ''));
}
