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
        "absolute -top-1.5 -right-1.5 h-5 flex items-center justify-center",
        "bg-purple-600 text-white text-[10px] font-bold",
        "ring-2 ring-background shadow-lg",
        "animate-in zoom-in-50 duration-200",
        isOverflow ? "min-w-6 px-1.5 rounded-full" : "w-5 rounded-full",
        className
      )}
    >
      {displayCount}
    </span>
  );
}
