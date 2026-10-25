/** Launch configuration. Counts are authorized current users, never catalog buzz. */
export const HOT_SPOTS_LAUNCH = Object.freeze({ curatedWeight: 0.70, liveWeight: 0.30, liveUserThreshold: 10 });

export function leaderboardWeights(_uniqueCheckins = 0) {
  return { curated: HOT_SPOTS_LAUNCH.curatedWeight, live: HOT_SPOTS_LAUNCH.liveWeight };
}

export interface RankedSpot { venue_id: string | null; venue_name: string; popularity_rank: number; count: number }

/** popularity_rank here is the effective curated rank, resolved before scoring. */
export function nightlifeScore(venue: RankedSpot) {
  const rank = Number.isFinite(venue.popularity_rank) && venue.popularity_rank >= 1 ? venue.popularity_rank : 999;
  const users = Number.isFinite(venue.count) ? Math.max(0, venue.count) : 0;
  const curated = 10 / (rank + 9);
  const live = Math.min(users / HOT_SPOTS_LAUNCH.liveUserThreshold, 1);
  return { curated, live, final: HOT_SPOTS_LAUNCH.curatedWeight * curated + HOT_SPOTS_LAUNCH.liveWeight * live };
}

export function rankNightlife<T extends RankedSpot>(venues: T[], _uniqueCheckins = 0): T[] {
  return [...venues].sort((a, b) => nightlifeScore(b).final - nightlifeScore(a).final
    || nightlifeScore(b).curated - nightlifeScore(a).curated || b.count - a.count
    || a.venue_name.localeCompare(b.venue_name, 'en') || (a.venue_id ?? '').localeCompare(b.venue_id ?? ''));
}
