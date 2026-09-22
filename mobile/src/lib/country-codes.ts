import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';

/**
 * Country dialling codes for the sign-in phone field.
 *
 * Spotted only launches in US cities, so **the US is the only country a
 * user may sign in from today**. The rest of the list is still rendered —
 * dimmed and unselectable — so the picker answers "can I use my foreign
 * number?" with a clear no rather than looking broken or missing.
 *
 * To open another country: add its code to SUPPORTED_COUNTRIES, and give it
 * an `nsnLength` if its national numbers are a fixed length (otherwise it
 * falls back to the ITU 6–15 envelope). Nothing else needs to change.
 */
export const SUPPORTED_COUNTRIES: readonly string[] = ['US'];

export function isSupported(code: string): boolean {
  return SUPPORTED_COUNTRIES.includes(code);
}

export interface Country {
  /** ISO 3166-1 alpha-2 — the stable key, and what the flag is drawn from. */
  code: string;
  name: string;
  /** Dial prefix including the leading "+". */
  dial: string;
  /** Digits in a valid national number, used to validate and to format. */
  nsnLength?: number;
}

/** Regional-indicator flag for an alpha-2 code ("US" → 🇺🇸). */
export function flagFor(code: string): string {
  return String.fromCodePoint(
    ...code.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** The only selectable country today, and the field's starting value. */
export const DEFAULT_COUNTRY: Country = { code: 'US', name: 'United States', dial: '+1', nsnLength: 10 };

const POPULAR: Country[] = [
  DEFAULT_COUNTRY,
  { code: 'CA', name: 'Canada', dial: '+1', nsnLength: 10 },
  { code: 'GB', name: 'United Kingdom', dial: '+44' },
  { code: 'MX', name: 'Mexico', dial: '+52' },
  { code: 'IN', name: 'India', dial: '+91', nsnLength: 10 },
  { code: 'AU', name: 'Australia', dial: '+61' },
];

const REST: Country[] = [
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'AT', name: 'Austria', dial: '+43' },
  { code: 'BD', name: 'Bangladesh', dial: '+880' },
  { code: 'BE', name: 'Belgium', dial: '+32' },
  { code: 'BR', name: 'Brazil', dial: '+55' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'CN', name: 'China', dial: '+86' },
  { code: 'CO', name: 'Colombia', dial: '+57' },
  { code: 'CZ', name: 'Czechia', dial: '+420' },
  { code: 'DK', name: 'Denmark', dial: '+45' },
  { code: 'DO', name: 'Dominican Republic', dial: '+1' },
  { code: 'EG', name: 'Egypt', dial: '+20' },
  { code: 'FI', name: 'Finland', dial: '+358' },
  { code: 'FR', name: 'France', dial: '+33' },
  { code: 'DE', name: 'Germany', dial: '+49' },
  { code: 'GR', name: 'Greece', dial: '+30' },
  { code: 'HK', name: 'Hong Kong', dial: '+852' },
  { code: 'HU', name: 'Hungary', dial: '+36' },
  { code: 'ID', name: 'Indonesia', dial: '+62' },
  { code: 'IE', name: 'Ireland', dial: '+353' },
  { code: 'IL', name: 'Israel', dial: '+972' },
  { code: 'IT', name: 'Italy', dial: '+39' },
  { code: 'JM', name: 'Jamaica', dial: '+1' },
  { code: 'JP', name: 'Japan', dial: '+81' },
  { code: 'KE', name: 'Kenya', dial: '+254' },
  { code: 'MY', name: 'Malaysia', dial: '+60' },
  { code: 'MA', name: 'Morocco', dial: '+212' },
  { code: 'NL', name: 'Netherlands', dial: '+31' },
  { code: 'NZ', name: 'New Zealand', dial: '+64' },
  { code: 'NG', name: 'Nigeria', dial: '+234' },
  { code: 'NO', name: 'Norway', dial: '+47' },
  { code: 'PK', name: 'Pakistan', dial: '+92' },
  { code: 'PE', name: 'Peru', dial: '+51' },
  { code: 'PH', name: 'Philippines', dial: '+63' },
  { code: 'PL', name: 'Poland', dial: '+48' },
  { code: 'PT', name: 'Portugal', dial: '+351' },
  { code: 'PR', name: 'Puerto Rico', dial: '+1' },
  { code: 'QA', name: 'Qatar', dial: '+974' },
  { code: 'RO', name: 'Romania', dial: '+40' },
  { code: 'RU', name: 'Russia', dial: '+7' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966' },
  { code: 'SG', name: 'Singapore', dial: '+65' },
  { code: 'ZA', name: 'South Africa', dial: '+27' },
  { code: 'KR', name: 'South Korea', dial: '+82' },
  { code: 'ES', name: 'Spain', dial: '+34' },
  { code: 'LK', name: 'Sri Lanka', dial: '+94' },
  { code: 'SE', name: 'Sweden', dial: '+46' },
  { code: 'CH', name: 'Switzerland', dial: '+41' },
  { code: 'TW', name: 'Taiwan', dial: '+886' },
  { code: 'TH', name: 'Thailand', dial: '+66' },
  { code: 'TR', name: 'Türkiye', dial: '+90' },
  { code: 'UA', name: 'Ukraine', dial: '+380' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971' },
  { code: 'VN', name: 'Vietnam', dial: '+84' },
];

/**
 * Supported countries lead; everything else follows alphabetically, dimmed
 * in the picker. SUPPORTED_COUNT is where the divider goes.
 */
export const COUNTRIES: Country[] = [...POPULAR, ...REST].sort((a, b) => {
  const sa = isSupported(a.code);
  const sb = isSupported(b.code);
  if (sa !== sb) return sa ? -1 : 1;
  return a.name.localeCompare(b.name);
});

/** Where the supported block ends and the unavailable one begins. */
export const SUPPORTED_COUNT = SUPPORTED_COUNTRIES.length;

export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
}

export function searchCountries(term: string): Country[] {
  const q = term.trim().toLowerCase().replace(/^\+/, '');
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase() === q ||
      c.dial.slice(1).startsWith(q),
  );
}

/**
 * US/Canada national numbers get the familiar "(555) 123-4567" grouping.
 * Everywhere else keeps plain digits — a wrong mask reads as a wrong
 * number, and we don't carry per-country formatting rules.
 */
export function formatNational(digits: string, country: Country): string {
  if (country.dial !== '+1') return digits;
  const d = digits.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Pretty-print an E.164 number for display — "+1 (555) 123-4567". Used on
 * the OTP screen, which only receives the assembled number.
 */
export function formatE164(e164: string): string {
  if (!e164.startsWith('+1') || e164.length !== 12) return e164;
  const country = DEFAULT_COUNTRY;
  return `${country.dial} ${formatNational(e164.slice(2), country)}`;
}

/** Placeholder that matches what `formatNational` will produce. */
export function placeholderFor(country: Country): string {
  return country.dial === '+1' ? '(555) 123-4567' : 'phone number';
}

/**
 * Why a national number isn't sendable yet, or null when it is. A country
 * with a known fixed length (US/CA/IN) is checked exactly; the rest use the
 * ITU envelope, because per-country rules would reject valid numbers.
 */
export function validateNational(digits: string, country: Country): string | null {
  if (digits.length === 0) return 'enter your phone number';
  if (country.nsnLength) {
    if (digits.length < country.nsnLength) {
      return `${country.name} numbers are ${country.nsnLength} digits`;
    }
    if (digits.length > country.nsnLength) {
      return `that's ${digits.length} digits — ${country.name} numbers are ${country.nsnLength}`;
    }
    if (country.dial === '+1' && /^[01]/.test(digits)) {
      return 'area codes don’t start with 0 or 1';
    }
    return null;
  }
  if (digits.length < 6) return 'that number looks too short';
  if (digits.length > 15) return 'that number looks too long';
  return null;
}

/** E.164, which is what Supabase/Twilio expect. */
export function toE164(digits: string, country: Country): string {
  return `${country.dial}${digits}`;
}

/* ---------------------------------------------------------------------- *
 * Picker request store — /auth/country-code is a separate screen (a form
 * sheet), so the current selection and the handler cross that boundary
 * here, the same pattern as lib/audience.ts and lib/tag-picker.ts.
 * ---------------------------------------------------------------------- */

interface CountryPickerRequest {
  selected: string;
  onSelect: (country: Country) => void;
}

let request: CountryPickerRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openCountryPicker(req: CountryPickerRequest): void {
  request = req;
  emit();
  router.push('/auth/country-code');
}

export function clearCountryRequest(): void {
  request = null;
  emit();
}

export function useCountryPickerRequest(): CountryPickerRequest | null {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => request,
    () => request,
  );
}
