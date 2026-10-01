export type CardRelationship = 'close' | 'direct' | 'mutual' | 'unrelated';
export function relationshipTier(close: boolean, direct: boolean, mutualCount: number): CardRelationship {
  return direct ? (close ? 'close' : 'direct') : mutualCount > 0 ? 'mutual' : 'unrelated';
}
