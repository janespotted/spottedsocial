import { useClockNight, useClockMinute } from '@/lib/night-clock';
import { useQuery } from '@tanstack/react-query';
import { fetchNightModeServerState, NIGHT_MODE_KEY, type NightModeKind } from '@/lib/night-mode';
import { formatOpeningTime, nightModeOpensAt, nightResetAt } from '@/lib/tonight';
import { useOwnNightStatus } from './use-own-night-status';
import { useSession } from './use-session';

export interface NightMode {
  mode: NightModeKind;
  isNight: boolean;
  /** Profile city ('nyc' until the profile loads). */
  city: string;
  /** Tonight's opening, in the profile city. */
  opensAt: Date;
  /** "6 PM" — for "Opens today at 6 PM". */
  opensLabel: string;
  /** The next 5 AM reset. */
  resetsAt: Date;
  tester: boolean;
  override: NightModeKind | null;
  /** Whether the server enforces the schedule for everyone (testers see this). */
  enforced: boolean;
}

/**
 * THE Day/Night switch. Every screen that differs by mode reads this, so they
 * flip together: one shared clock handles opening and the 5 AM reset,
 * plus a foreground re-check,
 * so an app left open across 6 PM changes without a restart.
 */
export function useNightMode(): NightMode {
  const { session } = useSession();
  const own = useOwnNightStatus();
  const city = own.data?.city ?? 'nyc';
  const server = useQuery({
    queryKey: [NIGHT_MODE_KEY, session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: fetchNightModeServerState,
  });

  const clockNight = useClockNight(city);
  const now = new Date();

  const override = server.data?.override ?? null;
  const isNight = override ? override === 'night' : clockNight;
  const opensAt = nightModeOpensAt(now, city);
  return {
    mode: isNight ? 'night' : 'day',
    isNight,
    city,
    opensAt,
    opensLabel: formatOpeningTime(opensAt, city),
    resetsAt: nightResetAt(now, city),
    tester: !!server.data?.tester,
    override,
    enforced: !!server.data?.enforced,
  };
}

/**
 * Hours and minutes until `target`, re-rendering on each minute. Shared by
 * the Home countdown row and the opening screens so they never disagree.
 */
export function useCountdown(target: Date): { hours: string; minutes: string; totalMs: number } {
  const now = useClockMinute();
  const totalMs = Math.max(0, target.getTime() - now);
  // Round up to the minute: at 5:59:30 it still reads 0h 01m, never 0h 00m.
  const totalMin = Math.ceil(totalMs / 60_000);
  return {
    hours: String(Math.floor(totalMin / 60)).padStart(2, '0'),
    minutes: String(totalMin % 60).padStart(2, '0'),
    totalMs,
  };
}
