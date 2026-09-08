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
let state: MapFilters = { relationship: 'all', venueType: 'all' };
const listeners = new Set<() => void>();

export function setMapFilters(partial: Partial<MapFilters>): void {
  state = { ...state, ...partial };
  listeners.forEach((listener) => listener());
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
