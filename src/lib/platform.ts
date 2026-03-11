import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * Whether we're running inside a Capacitor native shell (iOS/Android)
 */
export const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * The published web URL — used for all shareable links, OAuth redirects,
 * email confirmation links, and password-reset URLs.
 * 
 * In the browser this equals window.location.origin.
 * In a native Capacitor shell window.location.origin is "capacitor://localhost"
 * which is useless for shareable links, so we hard-code the hosted URL.
 */
export const APP_BASE_URL = 'https://spottedsocial.lovable.app';

/**
 * Returns the correct origin for OAuth redirect_uri and email redirect URLs.
 * On web, uses window.location.origin (works for previews & production).
 * On native, uses the published APP_BASE_URL so OAuth callbacks work.
 */
export const getRedirectOrigin = (): string => {
  return isNativePlatform() ? APP_BASE_URL : window.location.origin;
};

/**
 * Returns a shareable URL. Always uses APP_BASE_URL so links work for everyone.
 */
export const getShareableUrl = (path: string): string => {
  return `${APP_BASE_URL}${path}`;
};

/**
 * Open an external URL. Uses @capacitor/browser on native (in-app Safari sheet)
 * and window.open on web.
 */
export const openExternalUrl = async (url: string): Promise<void> => {
  if (isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank');
  }
};

/**
 * Copy text to clipboard. Uses a fallback-safe approach.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (isNativePlatform()) {
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
