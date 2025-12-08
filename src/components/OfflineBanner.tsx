import { useOfflineCache } from '@/hooks/useOfflineCache';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline } = useOfflineCache();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="max-w-[430px] mx-auto">
        <div className="bg-amber-500/90 backdrop-blur px-4 py-2 flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4 text-amber-950" />
          <span className="text-amber-950 text-sm font-medium">
            You're offline. Some features may not work.
          </span>
        </div>
      </div>
    </div>
  );
}
