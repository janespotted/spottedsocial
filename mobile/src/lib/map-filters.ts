import { useSyncExternalStore } from 'react';

export type RelationshipFilter = 'all' | 'close' | 'friends_only';
export type VenueTypeFilter =
  | 'all'
  | 'nightclub'
  | 'cocktail_bar'
  | 'bar'
  | 'restaurant'
  | 'rooftop';

export interface MapFilters {
  relationship: RelationshipFilter;
  venueType: VenueTypeFilter;
}

/**
 * Map filter state shared between the map screen and the /map-filters
 * form sheet route (native sheets are separate screens, so plain props
 * can't cross the boundary).
 */
export const DEFAULT_MAP_FILTERS: MapFilters = { relationship: 'all', venueType: 'all' };

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
  return f.relationship === DEFAULT_MAP_FILTERS.relationship && f.venueType === DEFAULT_MAP_FILTERS.venueType;
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
