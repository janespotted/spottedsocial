import type { Href } from 'expo-router';
import type { Plan } from './plans';

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function planDestination(id: string): Href {
  return { pathname: '/plan-detail', params: { planId: id } } as Href;
}

export function editPlanDestination(plan: Plan): Href {
  return { pathname: '/edit-plan', params: {
    planId: plan.id, venueId: plan.venue_id ?? '', venueName: plan.venue_name,
    planDate: plan.plan_date, planTime: plan.plan_time, planType: plan.plan_type ?? '',
    description: plan.description ?? '', visibility: plan.visibility,
  } };
}

/** Plan discussion follows the plan's own night, not the night a reply is sent. */
export function planChatExpiryLabel(planDate: string): string {
  const date = new Date(`${planDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return 'This chat stays until the plan ends.';
  date.setUTCDate(date.getUTCDate() + 1);
  return `Plan chat stays until 5 AM ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}, in the plan’s city.`;
}
