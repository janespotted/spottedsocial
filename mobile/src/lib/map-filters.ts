import { useSyncExternalStore } from 'react';
import type { Audience } from './audience';

/**
 * Who is drawn on the map. Same three tiers and values as the sharing
 * audience (`lib/audience.ts`) so the words mean the same thing everywhere,
 * but this is a VIEWING choice: it changes what the viewer sees and never
 * touches `profiles.location_sharing_level`.
 */
export type PeopleFilter = Audience;

export type VenueTypeFilter =
  | 'all'
  | 'nightclub'
  | 'cocktail_bar'
  | 'bar'
  | 'restaurant'
  | 'rooftop';

export interface MapFilters {
  /** Progressive: close_friends ⊂ all_friends ⊂ mutual_friends. */
  people: PeopleFilter;
  /** Venue pins on or off — independent of the people filter. */
  showVenues: boolean;
  venueType: VenueTypeFilter;
}

export const DEFAULT_MAP_FILTERS: MapFilters = {
  people: 'mutual_friends',
  showVenues: true,
  venueType: 'all',
};

/** Relationship-ring types in the order the people filter widens them. */
const RELATIONSHIP_RANK: Record<'close' | 'direct' | 'mutual', number> = { close: 0, direct: 1, mutual: 2 };
const PEOPLE_RANK: Record<PeopleFilter, number> = { close_friends: 0, all_friends: 1, mutual_friends: 2 };

/** Whether a pin with this relationship is inside the chosen people tier. */
export function peopleFilterIncludes(
  people: PeopleFilter,
  relationship: 'close' | 'direct' | 'mutual'
): boolean {
  return RELATIONSHIP_RANK[relationship] <= PEOPLE_RANK[people];
}

/**
 * Map filter state shared between the map screen and the /map-filters
 * form sheet route (native sheets are separate screens, so plain props
 * can't cross the boundary).
 */
let state: MapFilters = DEFAULT_MAP_FILTERS;
const listeners = new Set<() => void>();

export function setMapFilters(partial: Partial<MapFilters>): void {
  state = { ...state, ...partial };
  listeners.forEach((listener) => listener());
}

export function resetMapFilters(): void {
  state = DEFAULT_MAP_FILTERS;
  listeners.forEach((listener) => listener());
}

/** True when nothing is narrowing the map — drives the filter button's badge. */
export function isDefaultMapFilters(f: MapFilters): boolean {
  return (
    f.people === DEFAULT_MAP_FILTERS.people &&
    f.showVenues === DEFAULT_MAP_FILTERS.showVenues &&
    f.venueType === DEFAULT_MAP_FILTERS.venueType
  );
}

export function useMapFilters(): MapFilters {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => state
  );
}
