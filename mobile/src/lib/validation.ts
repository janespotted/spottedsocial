/**
 * Port of the web validation-schemas.ts rules (zod there, plain TS here —
 * the schemas are just trim + length constraints).
 */

interface ValidationResult {
  success: boolean;
  error?: string;
  data?: string;
}

export function validatePostText(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length > 500) {
    return { success: false, error: 'Caption must be less than 500 characters' };
  }
  return { success: true, data: trimmed };
}

export function validateVenueName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (trimmed.length > 200) {
    return { success: false, error: 'Venue name must be less than 200 characters' };
  }
  return { success: true, data: trimmed };
}

export function validateCommentText(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { success: false, error: 'Comment cannot be empty' };
  if (trimmed.length > 500) {
    return { success: false, error: 'Comment must be less than 500 characters' };
  }
  return { success: true, data: trimmed };
}
