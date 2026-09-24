import { getSessionAccessToken, onSessionTokenChange } from '@/lib/session-identity';
import { createElement, forwardRef, useSyncExternalStore } from 'react';
import { withUniwind } from 'uniwind';
import { Image as ExpoImage, type ImageProps, type ImageSource } from 'expo-image';
import { isPrivateMediaUrl, normalizePrivateMediaUrl, privateMediaSource } from '@/lib/private-media';

// Disable native disk/memory caching for protected bytes, including thumbnails.
// AccountScope remounts existing native views when identity changes.
const SecureImage = forwardRef<ExpoImage, ImageProps>((props, ref) => {
  useSyncExternalStore(onSessionTokenChange, getSessionAccessToken, getSessionAccessToken);
  let protectedSource = false;
  const source = (value: ImageProps['source']): ImageProps['source'] => {
    if (Array.isArray(value)) return value.map(v => source(v) as ImageSource);
    const uri = typeof value === 'string' ? value : value && typeof value === 'object' && 'uri' in value ? value.uri : undefined;
    if (uri && isPrivateMediaUrl(normalizePrivateMediaUrl(uri))) {
      protectedSource = true;
      return { ...(typeof value === 'object' ? value : {}), ...privateMediaSource(uri) };
    }
    return value;
  };
  const resolved = source(props.source);
  return createElement(ExpoImage, { ...props, ref, source: resolved, ...(protectedSource ? { cachePolicy: 'none' } : {}) });
});
SecureImage.displayName = 'SecureImage';
export const Image = withUniwind(SecureImage);
