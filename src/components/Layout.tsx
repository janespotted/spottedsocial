import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { CheckInModal } from './CheckInModal';
import { useCheckIn } from '@/contexts/CheckInContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { showCheckIn, closeCheckIn } = useCheckIn();

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="max-w-[430px] mx-auto">
        {children}
      </main>
      <BottomNav />
      <CheckInModal open={showCheckIn} onOpenChange={closeCheckIn} />
    </div>
  );
}
