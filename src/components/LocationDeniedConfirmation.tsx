import { MapPin, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openExternalUrl } from '@/lib/platform';

interface LocationDeniedConfirmationProps {
  onOpenSettings: () => void;
  onContinueAnyway: () => void;
}

export function LocationDeniedConfirmation({ onOpenSettings, onContinueAnyway }: LocationDeniedConfirmationProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex flex-col">
      {/* Hero — warning icon centered in top half */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: '#ef4444', transform: 'scale(2.5)' }}
          />
          <div className="relative w-28 h-28 rounded-full bg-red-500/15 flex items-center justify-center">
            <MapPin className="h-14 w-14 text-red-400" />
          </div>
        </div>
      </div>

      {/* Content card — bottom section */}
      <div className="bg-[#110a24]/80 border-t border-white/8 rounded-t-3xl px-6 pt-8 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h1 className="text-[26px] font-bold text-white leading-tight mb-3">
          Location access needed
        </h1>
        <p className="text-white/50 text-[15px] leading-relaxed mb-8">
          Spotted needs your location to detect friends and venues nearby. Without it, most features won't work.
        </p>

        <Button
          onClick={() => {
            openExternalUrl('app-settings:');
            onOpenSettings();
          }}
          className="w-full bg-[#d4ff00] text-[#0a0118] hover:bg-[#d4ff00]/90 font-semibold text-base h-14 rounded-full"
        >
          <Settings className="h-4 w-4 mr-2" />
          Open Settings
        </Button>
        <button
          onClick={onContinueAnyway}
          className="w-full text-center text-white/30 hover:text-white/50 text-sm transition-colors mt-4 py-2"
        >
          Continue without location
        </button>
      </div>
    </div>
  );
}
