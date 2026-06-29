import { MapPin } from 'lucide-react';
import { openExternalUrl } from '@/lib/platform';

export function LocationDegradedBanner() {
  return (
    <button
      onClick={() => openExternalUrl('app-settings:')}
      className="w-full flex items-center gap-2 px-4 py-2.5 bg-red-500/15 border-b border-red-500/20"
    >
      <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
      <span className="text-red-300 text-xs font-medium flex-1 text-left">
        Location is off — tap to enable in Settings
      </span>
    </button>
  );
}
