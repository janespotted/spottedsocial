export type PlanAudience = 'close_friends' | 'friends' | 'mutual_friends';
export const PLAN_AUDIENCES: { key: PlanAudience; label: string }[] = [
  { key: 'close_friends', label: 'Close Friends' },
  { key: 'friends', label: 'Friends' },
  { key: 'mutual_friends', label: 'Friends + Mutuals' },
];
export function planAudience(value: string): PlanAudience {
  return value === 'close_friends' || value === 'mutual_friends' ? value : 'friends';
}
