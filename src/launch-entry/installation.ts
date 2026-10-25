export function installationLink(value: unknown): { url: string; label: string } | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname === 'apps.apple.com') return { url: value, label: 'Download on the App Store' };
    if (url.hostname === 'testflight.apple.com' && /^\/(join|j)\/[a-zA-Z0-9]+$/.test(url.pathname)) return { url: value, label: 'Get Spotted on TestFlight' };
  } catch { /* Unconfigured links never become buttons. */ }
  return null;
}
