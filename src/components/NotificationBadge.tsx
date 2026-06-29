import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
  max?: number;
  className?: string;
}

export function NotificationBadge({ count, max = 9, className }: NotificationBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count;
  const isOverflow = count > max;

  return (
    <span
      className={cn(
        "absolute -top-1 -right-1 h-4 flex items-center justify-center",
        "bg-red-500 text-white text-[9px] font-bold",
        "ring-1.5 ring-background",
        "animate-in zoom-in-50 duration-200",
        isOverflow ? "min-w-5 px-1 rounded-full" : "w-4 rounded-full",
        className
      )}
    >
      {displayCount}
    </span>
  );
}
