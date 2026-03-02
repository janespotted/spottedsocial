import { cn } from '@/lib/utils';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface SpottedLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders the Spotted "S" logo with true transparency.
 * Uses the PNG as a luminance mask so the golden S shows through
 * while the black background becomes fully transparent.
 * Works in all stacking contexts (backdrop-filter, transforms, etc).
 */
export function SpottedLogo({ className, style }: SpottedLogoProps) {
  return (
    <div
      aria-label="Spotted"
      role="img"
      className={cn('bg-gradient-to-br from-[#e8d48b] via-[#c4a052] to-[#b8942e]', className)}
      style={{
        WebkitMaskImage: `url(${spottedLogo})`,
        maskImage: `url(${spottedLogo})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        ...style,
      }}
    />
  );
}
