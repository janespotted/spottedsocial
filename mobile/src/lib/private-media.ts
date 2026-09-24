import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase';
import { getSessionAccessToken, getSessionRevision } from './session-identity';
const endpoint = `${SUPABASE_URL}/functions/v1/private-media`;
export function privateMediaUrl(params: Record<string, string>): string {
  return `${endpoint}?${new URLSearchParams({ ...params, account: String(getSessionRevision()) })}`;
}
export function normalizePrivateMediaUrl(uri: string): string {
  const match = uri.match(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/post-images\/([^?]+)/);
  return match ? privateMediaUrl({ path: decodeURIComponent(match[1]) }) : uri;
}
export function isPrivateMediaUrl(uri: string): boolean {
  return uri.startsWith(`${endpoint}?`);
}
export function privateMediaSource(uri: string) {
  uri = normalizePrivateMediaUrl(uri);
  return isPrivateMediaUrl(uri) ? {
    uri,
    headers: { Authorization: `Bearer ${getSessionAccessToken() ?? ''}`, apikey: SUPABASE_PUBLISHABLE_KEY },
    cacheKey: `${getSessionRevision()}:${uri}`,
  } : { uri };
}
