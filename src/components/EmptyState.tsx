import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction,
  children 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-[#a855f7]/60" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        {title}
      </h3>
      <p className="text-white/50 text-sm max-w-xs mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full px-6"
        >
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
