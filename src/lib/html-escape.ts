/**
 * Escapes HTML special characters to prevent XSS attacks
 * when using innerHTML with user-controlled data
 */
export const escapeHtml = (unsafe: string | null | undefined): string => {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Escapes a URL for safe use in HTML attributes
 * Only allows http, https, and data URLs
 */
export const escapeUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  // Allow only safe URL schemes
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('/')) {
    return escapeHtml(url);
  }
  return '';
};
