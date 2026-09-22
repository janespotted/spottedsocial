/**
 * THE single definition of "tonight".
 *
 * A night runs from 5:00 AM to 5:00 AM in the user's profile-city time zone
 * (NYC → America/New_York, LA → America/Los_Angeles). Every surface that
 * asks "is this from tonight?", "when does this expire?" or "has the night
 * reset?" — night statuses, check-ins, posts, yaps, map/leaderboard
 * freshness, and the opening status prompt — must go through this module so
 * they can never disagree.
 *
 * The active city is set once the profile loads (NightStatusGate) so callers
 * without a city in hand (posts, yaps, DM freshness) still use the profile
 * zone rather than the device zone. Before it is known, New York is assumed,
 * matching the historical default of the status expiry.
 */

export const NIGHT_RESET_HOUR = 5;

let activeCity: string | null = null;

/** Remember the profile city so zone-less callers agree with the rest of the app. */
export function setActiveCity(city: string | null | undefined): void {
  activeCity = city ?? null;
}

export function getActiveCity(): string | null {
  return activeCity;
}

export function cityToTimezone(city?: string | null): string {
  const c = city ?? activeCity;
  if (c === 'la') return 'America/Los_Angeles';
  // Lahore is a dev/QA demo city (UTC+5, no daylight saving) so the
  // developer can test against venues they can actually walk to.
  if (c === 'lhr') return 'Asia/Karachi';
  return 'America/New_York';
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(tz, f);
  }
  return f;
}

function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = formatterFor(tz).formatToParts(date);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // Intl can emit "24" at midnight
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (ms) such that wall-clock-in-tz = UTC + offset, at the given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * Wall-clock (year, month, day, hour) in `tz` → UTC instant. Two-pass so the
 * offset is taken at the target instant, not at "now" — correct across DST
 * transitions. `day` may overflow/underflow the month; Date.UTC normalizes.
 */
function zonedToUtc(year: number, month: number, day: number, hour: number, tz: string): Date {
  const naive = Date.UTC(year, month - 1, day, hour, 0, 0);
  const firstGuess = new Date(naive - tzOffsetMs(new Date(naive), tz));
  return new Date(naive - tzOffsetMs(firstGuess, tz));
}

/** The 5 AM that started the current night (most recent reset ≤ now). */
export function nightStartAt(now: Date = new Date(), city?: string | null): Date {
  const tz = cityToTimezone(city);
  const p = zonedParts(now, tz);
  const dayShift = p.hour < NIGHT_RESET_HOUR ? -1 : 0;
  return zonedToUtc(p.year, p.month, p.day + dayShift, NIGHT_RESET_HOUR, tz);
}

/**
 * The 5 AM that ends the night of a given calendar date (YYYY-MM-DD) in the
 * city's zone — i.e. 5 AM the following morning. Plans are stamped with
 * this so they expire with the night they belong to, wherever the user's
 * device happens to be (addendum v3 §2).
 */
export function nightResetAfterDate(planDate: string, city?: string | null): Date {
  const [year, month, day] = planDate.split('-').map(Number);
  const tz = cityToTimezone(city);
  // Noon on the plan date sits safely inside that day in any zone, so the
  // NEXT 5 AM is the end of that night.
  return nightResetAt(zonedToUtc(year, month, day, 12, tz), city);
}

/** The next 5 AM — when tonight's statuses, check-ins and posts all expire. */
export function nightResetAt(now: Date = new Date(), city?: string | null): Date {
  const tz = cityToTimezone(city);
  const p = zonedParts(now, tz);
  const dayShift = p.hour < NIGHT_RESET_HOUR ? 0 : 1;
  return zonedToUtc(p.year, p.month, p.day + dayShift, NIGHT_RESET_HOUR, tz);
}

/** ISO string of the next reset — the one expiry used for every tonight-scoped row. */
export function getNightResetIso(city?: string | null): string {
  return nightResetAt(new Date(), city).toISOString();
}

export function msUntilNightReset(city?: string | null): number {
  return Math.max(0, nightResetAt(new Date(), city).getTime() - Date.now());
}

/**
 * Stable key for the night a timestamp belongs to ("YYYY-MM-DD" of the
 * evening it started). Two timestamps are "the same night" iff keys match.
 */
export function getNightKey(date: Date = new Date(), city?: string | null): string {
  const tz = cityToTimezone(city);
  const p = zonedParts(date, tz);
  const dayShift = p.hour < NIGHT_RESET_HOUR ? -1 : 0;
  return new Date(Date.UTC(p.year, p.month - 1, p.day + dayShift)).toISOString().slice(0, 10);
}

/** Whether a timestamp falls inside the current night window. */
export function isFromTonight(timestamp: string | Date | null, city?: string | null): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return getNightKey(date, city) === getNightKey(new Date(), city);
}

/** True when the wall clock in the city's zone is between 11 AM and 5 AM. */
export function isNightlifeHours(city?: string | null): boolean {
  const { hour } = zonedParts(new Date(), cityToTimezone(city));
  return hour >= 11 || hour < NIGHT_RESET_HOUR;
}

/**
 * A location is "fresh" when it is from tonight and under two hours old.
 * Shared by Map, Leaderboard, and venue surfaces so pins agree everywhere.
 */
export function isFreshLocation(timestamp: string | Date | null, city?: string | null): boolean {
  if (!timestamp) return false;
  if (!isFromTonight(timestamp, city)) return false;
  const age = Date.now() - new Date(timestamp).getTime();
  return age < 2 * 60 * 60 * 1000;
}

/** Whether a stored expiry is still in the future (null/invalid → expired). */
export function isUnexpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/** 10 AM following this nightlife session, in the profile city. */
export function morningAfterAt(now: Date = new Date(), city?: string | null): Date {
  const tz = cityToTimezone(city);
  const p = zonedParts(nightResetAt(now, city), tz);
  return zonedToUtc(p.year, p.month, p.day, 10, tz);
}
