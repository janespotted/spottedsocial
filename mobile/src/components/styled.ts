import { createElement, forwardRef } from 'react';
import { withUniwind } from 'uniwind';
import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { signedStoragePath } from '@/lib/private-media';

/**
 * Signed Storage URLs carry a fresh token on every mint; the storage path
 * never changes. Any signed post-images URL rendered without an explicit
 * cacheKey (DM photos, group avatars) is cached by its path, so it loads
 * from disk instead of re-downloading after the link is re-minted.
 */
const CachedImage = forwardRef<ExpoImage, ImageProps>((props, ref) => {
  const { source } = props;
  if (source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source && source.uri && !source.cacheKey) {
    const path = signedStoragePath(source.uri);
    if (path) return createElement(ExpoImage, { ...props, ref, source: { ...source, cacheKey: path } });
  } else if (typeof source === 'string') {
    const path = signedStoragePath(source);
    if (path) return createElement(ExpoImage, { ...props, ref, source: { uri: source, cacheKey: path } });
  }
  return createElement(ExpoImage, { ...props, ref });
});
CachedImage.displayName = 'CachedImage';

export const Image = withUniwind(CachedImage);
