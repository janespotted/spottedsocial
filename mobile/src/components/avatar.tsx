import { Avatar as HeroAvatar } from 'heroui-native';

interface AvatarProps {
  name: string;
  url: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, url, size = 'md' }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Seeded profiles store DiceBear SVG urls; RN's core Image (inside
  // HeroAvatar.Image) can't render SVG — DiceBear serves PNG at the same path
  const resolvedUrl = url?.includes('api.dicebear.com') ? url.replace('/svg', '/png') : url;

  return (
    <HeroAvatar size={size} color="accent" alt={name}>
      {resolvedUrl ? <HeroAvatar.Image source={{ uri: resolvedUrl }} /> : null}
      <HeroAvatar.Fallback>{initials || '?'}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}
