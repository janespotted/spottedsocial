import { URL } from 'react-native-url-polyfill';
export const LAUNCH_LINK_HOSTS = ['spottedsocial.vercel.app', 'spottedsocial-git-codex-nyc-onboarding-waves-spottedsocial.vercel.app'];
/** An entry link is navigation only. Access always comes from the verified phone on the server. */
export function isLaunchEntryLink(path: string): boolean {
  try {
    const url = new URL(path, 'spotted://app');
    if (url.username || url.password || url.port) return false;
    if (url.protocol !== 'spotted:' && !(url.protocol === 'https:' && LAUNCH_LINK_HOSTS.includes(url.hostname))) return false;
    const route = url.protocol === 'spotted:' && url.hostname !== 'app' ? `/${url.hostname}${url.pathname}` : url.pathname;
    return /^\/join(?:\.html)?\/?$/.test(route);
  } catch { return false; }
}
