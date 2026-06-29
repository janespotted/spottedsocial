import { MapPin, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openExternalUrl } from '@/lib/platform';
import { logEvent } from '@/lib/event-logger';
import { useEffect } from 'react';

interface AlwaysOnGateProps {
  permissionState: 'while_using' | 'denied';
  onDismiss: () => void;
}

export function AlwaysOnGate({ permissionState, onDismiss }: AlwaysOnGateProps) {
  useEffect(() => {
    logEvent('always_on_gate_shown', { state: permissionState });
  }, []);

  const isDenied = permissionState === 'denied';

  const handleOpenSettings = () => {
    logEvent('always_on_gate_open_settings');
    openExternalUrl('app-settings:');
    // Dismiss after a short delay so user can come back
    setTimeout(onDismiss, 500);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-b from-[#1a0f2e] to-[#0a0118] flex flex-col">
      {/* Hero area — large pin icon centered in top half */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          {/* Glow effect */}
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-30"
            style={{ backgroundColor: '#a855f7', transform: 'scale(2.5)' }}
          />
          {/* Pin icon */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
              {/* Pin shape */}
              <path
                d="M60 10C38.5 10 21 27.5 21 49C21 78 60 110 60 110C60 110 99 78 99 49C99 27.5 81.5 10 60 10Z"
                fill="url(#pinGradient)"
                stroke="rgba(168, 85, 247, 0.3)"
                strokeWidth="1.5"
              />
              {/* Inner circle */}
              <circle cx="60" cy="48" r="16" fill="#0a0118" opacity="0.8" />
              <circle cx="60" cy="48" r="12" fill="none" stroke="rgba(212, 255, 0, 0.4)" strokeWidth="1" />
              <defs>
                <linearGradient id="pinGradient" x1="60" y1="10" x2="60" y2="110" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#c084fc" />
                  <stop offset="0.5" stopColor="#a855f7" />
                  <stop offset="1" stopColor="#7c3aed" stopOpacity="0.6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Content card — bottom section */}
      <div className="bg-[#110a24]/80 border-t border-white/8 rounded-t-3xl px-6 pt-8 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h1 className="text-[26px] font-bold text-white leading-tight mb-3">
          {isDenied
            ? 'Turn on location to use Spotted'
            : 'Upgrade to "Always Allow" for the full experience'}
        </h1>

        <p className="text-white/50 text-[15px] leading-relaxed mb-8">
          {isDenied
            ? "Spotted needs your location to detect when you arrive at venues and show which friends are nearby. Without it, most features won't work."
            : 'Spotted works best with background location — auto check-ins, friend arrival alerts, and venue detection all need "Always Allow" to work when you\'re out.'}
        </p>

        <Button
          onClick={handleOpenSettings}
          className="w-full bg-[#d4ff00] text-[#0a0118] hover:bg-[#d4ff00]/90 font-semibold text-base h-14 rounded-full"
        >
          <Settings className="h-4 w-4 mr-2" />
          Open Settings
        </Button>

        <button
          onClick={() => {
            logEvent('always_on_gate_dismissed');
            onDismiss();
          }}
          className="w-full text-center text-white/30 hover:text-white/50 text-sm transition-colors mt-4 py-2"
        >
          {isDenied ? 'Continue without location' : 'Maybe later'}
        </button>
      </div>
    </div>
  );
}
