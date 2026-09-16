/**
 * Thin re-exports kept for existing imports. The one definition of "tonight"
 * (5 AM reset in the profile-city time zone) lives in ./tonight — add new
 * callers there, not here.
 */
export { getNightKey as getNightDate, isFromTonight, isNightlifeHours, isFreshLocation } from './tonight';
