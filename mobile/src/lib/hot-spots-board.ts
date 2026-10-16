import { effectiveCuratedRank, editorialForVenue } from './hot-spots-editorial';
import { rankNightlife } from './leaderboard-ranking';
import { eligibleVenuePresence, type VenuePresence } from './venue-presence';
import { isVenueOpen, type VenueHours } from './venue-hours';

export interface LeaderboardFriend { user_id: string; display_name: string; avatar_url: string | null }
export interface LeaderboardVenue {
  venue_name: string; venue_id: string; neighborhood: string | null;
  count: number; rank: number; movement: 'up' | 'down' | 'same'; friends: LeaderboardFriend[];
  energyLevel: number; isPromoted?: boolean; isNewlyOpened?: boolean;
  operatingHours?: VenueHours | null; recentCheckinCount: number; accessLabel?: string | null;
}
export interface BiggestMover { venue_name: string; venue_id: string; friends: LeaderboardFriend[] }
export interface LeaderboardData { venues: LeaderboardVenue[]; biggestMover: BiggestMover | null; nextExpiryAt: number | null }
export interface HotSpotsCatalogVenue {
  id: string; name: string; city: string | null; neighborhood: string | null;
  popularity_rank: number | null; google_place_id: string | null; leaderboard_eligible: boolean | null;
  is_demo: boolean | null; is_leaderboard_promoted: boolean | null; leaderboard_promo_order: number | null;
  opened_at: string | null; operating_hours: unknown;
}
type Profile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };

/** Catalog curation and authorized presence remain separate all the way to rendering. */
export function buildHotSpotsBoard(catalog: HotSpotsCatalogVenue[], snapshot: VenuePresence[], profiles: Profile[],
  options: { city: string; neighborhood: string | null; userId: string; friendIds: string[]; demo: boolean; now?: number },
  open: (hours: VenueHours) => boolean = isVenueOpen): LeaderboardData {
  const now = options.now ?? Date.now();
  const presence = eligibleVenuePresence(snapshot, options.demo, now);
  const byVenue = new Map<string, VenuePresence[]>();
  for (const row of presence) byVenue.set(row.venue_id!, [...(byVenue.get(row.venue_id!) ?? []), row]);
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const friendIds = new Set(options.friendIds);
  const recentOpening = new Date(now); recentOpening.setMonth(recentOpening.getMonth() - 3);
  const rows = [...new Map(catalog.map(v => [v.id, v])).values()]
    .filter(v => v.city === options.city && (v.leaderboard_eligible === true || editorialForVenue(v)?.accessLabel === 'Members only') && (options.demo || v.is_demo === false))
    .map(v => {
      const active = byVenue.get(v.id) ?? [];
      const promoted = v.is_leaderboard_promoted === true && v.leaderboard_promo_order !== null
        && v.leaderboard_promo_order >= 1 && v.leaderboard_promo_order <= 2;
      return {
        venue_id: v.id, venue_name: v.name, neighborhood: v.neighborhood, count: active.length,
        popularity_rank: effectiveCuratedRank(v), promoOrder: v.leaderboard_promo_order ?? 999,
        rank: 0, movement: 'same' as const, isPromoted: promoted,
        isNewlyOpened: !!v.opened_at && Date.parse(v.opened_at) > recentOpening.getTime(),
        operatingHours: v.operating_hours as VenueHours | null,
        accessLabel: editorialForVenue(v)?.accessLabel ?? null,
        energyLevel: active.length >= 10 ? 3 : active.length >= 5 ? 2 : active.length ? 1 : 0,
        // No invented arrival velocity from unrelated status edits.
        recentCheckinCount: 0,
        friends: active.flatMap(s => {
          const p = profileMap.get(s.user_id);
          return s.user_id !== options.userId && friendIds.has(s.user_id) && p ? [{
            user_id: s.user_id, display_name: p.display_name || p.username || 'Friend', avatar_url: p.avatar_url,
          }] : [];
        }).sort((a,b) => a.display_name.localeCompare(b.display_name, 'en') || a.user_id.localeCompare(b.user_id)),
      };
    })
    .filter(v => v.isPromoted || !v.operatingHours || open(v.operatingHours));
  const ordinary = rankNightlife(rows.filter(v => !v.isPromoted));
  const inArea = (v: { neighborhood: string | null }) => !options.neighborhood || v.neighborhood === options.neighborhood;
  const promoted = rows.filter(v => v.isPromoted && inArea(v)).sort((a,b) => a.promoOrder - b.promoOrder || a.venue_id.localeCompare(b.venue_id));
  const ranked = ordinary.filter(inArea).slice(0,20).map((v,index) => ({ ...v, rank: index+1 }));
  const activeSpot = ordinary.filter(v => inArea(v) && v.count > 0).sort((a,b) => b.count-a.count || a.popularity_rank-b.popularity_rank || a.venue_id.localeCompare(b.venue_id))[0];
  return { venues: [...promoted,...ranked], biggestMover: activeSpot ? {
    venue_id: activeSpot.venue_id, venue_name: activeSpot.venue_name, friends: activeSpot.friends.slice(0,3),
  } : null, nextExpiryAt: presence.length ? Math.min(...presence.map(s => Date.parse(s.expires_at!))) : null };
}
