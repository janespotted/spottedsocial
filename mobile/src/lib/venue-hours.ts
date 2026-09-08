/** Direct port of the web src/lib/venue-hours.ts (pure functions). */

export interface DayHours {
  open: string;
  close: string;
  is_overnight: boolean;
}

export interface VenueHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface VenueHoursDisplay {
  isOpen: boolean;
  displayText: string;
}

const DAYS: (keyof VenueHours)[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function getCurrentDay(): keyof VenueHours {
  return DAYS[new Date().getDay()];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** "18:00" → "6pm", "18:30" → "6:30pm" */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const isPM = hours >= 12;
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  if (minutes === 0) return `${displayHours}${isPM ? 'pm' : 'am'}`;
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${isPM ? 'pm' : 'am'}`;
}

export function isVenueOpen(operatingHours: VenueHours | null): boolean {
  if (!operatingHours) return false;
  const todayHours = operatingHours[getCurrentDay()];
  if (!todayHours) return false;

  const currentMinutes = getCurrentMinutes();
  const openMinutes = timeToMinutes(todayHours.open);
  const closeMinutes = timeToMinutes(todayHours.close);

  if (todayHours.is_overnight) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function getClosingTime(operatingHours: VenueHours | null): string | null {
  if (!operatingHours) return null;
  const todayHours = operatingHours[getCurrentDay()];
  if (!todayHours) return null;
  return formatTime(todayHours.close);
}

export function getNextOpenTime(operatingHours: VenueHours | null): string | null {
  if (!operatingHours) return null;
  const todayIndex = new Date().getDay();

  for (let i = 0; i < 7; i++) {
    const day = DAYS[(todayIndex + i) % 7];
    const dayHours = operatingHours[day];
    if (dayHours) {
      if (i === 0) {
        if (getCurrentMinutes() < timeToMinutes(dayHours.open)) {
          return formatTime(dayHours.open);
        }
      } else {
        const dayName = day.charAt(0).toUpperCase() + day.slice(1);
        return `${dayName} at ${formatTime(dayHours.open)}`;
      }
    }
  }
  return null;
}

export function getHoursDisplayString(operatingHours: VenueHours | null): VenueHoursDisplay {
  if (!operatingHours) return { isOpen: false, displayText: 'Hours unavailable' };

  if (isVenueOpen(operatingHours)) {
    const closingTime = getClosingTime(operatingHours);
    return { isOpen: true, displayText: closingTime ? `Closes at ${closingTime}` : 'Open now' };
  }
  const nextOpen = getNextOpenTime(operatingHours);
  return { isOpen: false, displayText: nextOpen ? `Opens ${nextOpen}` : 'Closed' };
}
