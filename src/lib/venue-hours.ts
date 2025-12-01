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

/**
 * Get current day name in lowercase
 */
function getCurrentDay(): keyof VenueHours {
  const days: (keyof VenueHours)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

/**
 * Convert time string "HH:MM" to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time in minutes since midnight
 */
function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Format time from 24h to 12h format (e.g., "18:00" -> "6pm")
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const isPM = hours >= 12;
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  // Only show minutes if not :00
  if (minutes === 0) {
    return `${displayHours}${isPM ? 'pm' : 'am'}`;
  }
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${isPM ? 'pm' : 'am'}`;
}

/**
 * Check if venue is currently open
 */
export function isVenueOpen(operatingHours: VenueHours | null): boolean {
  if (!operatingHours) return false;

  const today = getCurrentDay();
  const todayHours = operatingHours[today];
  
  if (!todayHours) return false;

  const currentMinutes = getCurrentMinutes();
  const openMinutes = timeToMinutes(todayHours.open);
  const closeMinutes = timeToMinutes(todayHours.close);

  // Handle overnight venues
  if (todayHours.is_overnight) {
    // If it's past opening time OR before closing time (early morning)
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  } else {
    // Normal hours: open <= current < close
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
}

/**
 * Get closing time for today (or null if closed)
 */
export function getClosingTime(operatingHours: VenueHours | null): string | null {
  if (!operatingHours) return null;

  const today = getCurrentDay();
  const todayHours = operatingHours[today];
  
  if (!todayHours) return null;

  return formatTime(todayHours.close);
}

/**
 * Get next opening time if currently closed
 */
export function getNextOpenTime(operatingHours: VenueHours | null): string | null {
  if (!operatingHours) return null;

  const days: (keyof VenueHours)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayIndex = new Date().getDay();

  // Check next 7 days for opening time
  for (let i = 0; i < 7; i++) {
    const dayIndex = (todayIndex + i) % 7;
    const day = days[dayIndex];
    const dayHours = operatingHours[day];

    if (dayHours) {
      if (i === 0) {
        // Today - check if it opens later
        const currentMinutes = getCurrentMinutes();
        const openMinutes = timeToMinutes(dayHours.open);
        if (currentMinutes < openMinutes) {
          return formatTime(dayHours.open);
        }
      } else {
        // Future day
        const dayName = day.charAt(0).toUpperCase() + day.slice(1);
        return `${dayName} at ${formatTime(dayHours.open)}`;
      }
    }
  }

  return null;
}

/**
 * Get formatted display string for venue hours status
 */
export function getHoursDisplayString(operatingHours: VenueHours | null): VenueHoursDisplay {
  if (!operatingHours) {
    return {
      isOpen: false,
      displayText: 'Hours unavailable'
    };
  }

  const open = isVenueOpen(operatingHours);

  if (open) {
    const closingTime = getClosingTime(operatingHours);
    return {
      isOpen: true,
      displayText: closingTime ? `Closes at ${closingTime}` : 'Open now'
    };
  } else {
    const nextOpen = getNextOpenTime(operatingHours);
    return {
      isOpen: false,
      displayText: nextOpen ? `Opens ${nextOpen}` : 'Closed'
    };
  }
}
