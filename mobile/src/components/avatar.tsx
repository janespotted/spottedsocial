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

  return (
    <HeroAvatar size={size} color="accent" alt={name}>
      {url ? <HeroAvatar.Image source={{ uri: url }} /> : null}
      <HeroAvatar.Fallback>{initials || '?'}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}
