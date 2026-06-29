import { ArrowLeft, Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logEvent } from '@/lib/event-logger';
import { useEffect } from 'react';

interface LocationPermissionEducationProps {
  onContinue: () => void;
  onBack?: () => void;
}

export function LocationPermissionEducation({ onContinue, onBack }: LocationPermissionEducationProps) {
  useEffect(() => {
    logEvent('permission_education_shown');
  }, []);

  const handleContinue = () => {
    logEvent('permission_education_continued');
    onContinue();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex flex-col">
      {/* Back button */}
      <div className="pt-[max(env(safe-area-inset-top),12px)] px-5 pb-2">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 rounded-full bg-white/10 text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Hero — large pin icon centered in top half */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-25"
            style={{ backgroundColor: '#a855f7', transform: 'scale(2.5)' }}
          />
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
              <path
                d="M60 10C38.5 10 21 27.5 21 49C21 78 60 110 60 110C60 110 99 78 99 49C99 27.5 81.5 10 60 10Z"
                fill="url(#pinGrad1)"
                stroke="rgba(168, 85, 247, 0.3)"
                strokeWidth="1.5"
              />
              <circle cx="60" cy="48" r="16" fill="#0a0118" opacity="0.8" />
              <circle cx="60" cy="48" r="12" fill="none" stroke="rgba(212, 255, 0, 0.4)" strokeWidth="1" />
              <defs>
                <linearGradient id="pinGrad1" x1="60" y1="10" x2="60" y2="110" gradientUnits="userSpaceOnUse">
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
      <div className="bg-[#110a24]/80 border-t border-white/8 rounded-t-3xl px-6 pt-7 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h1 className="text-[26px] font-bold text-white leading-tight mb-3">
          Stay connected with friends out tonight
        </h1>

        <p className="text-white/50 text-sm mb-4">Spotted uses your location to:</p>
        <div className="space-y-2 mb-5">
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#d4ff00] mt-1.5 flex-shrink-0" />
            <span className="text-white/70 text-[15px]">Auto-detect when you arrive at venues</span>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#d4ff00] mt-1.5 flex-shrink-0" />
            <span className="text-white/70 text-[15px]">Notify you when friends are out nearby</span>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#d4ff00] mt-1.5 flex-shrink-0" />
            <span className="text-white/70 text-[15px]">Sync your group without the texting chaos</span>
          </div>
        </div>

        {/* Options preview */}
        <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3 space-y-2.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full bg-[#d4ff00]/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-2.5 h-2.5 text-[#d4ff00]" />
            </div>
            <span className="text-white text-sm font-medium">Always Allow</span>
            <span className="text-[#d4ff00] text-xs">(recommended)</span>
          </div>
          <div className="flex items-center gap-2.5 opacity-45">
            <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Minus className="w-2.5 h-2.5 text-white/40" />
            </div>
            <span className="text-white/60 text-xs">While Using — manual check-ins only</span>
          </div>
          <div className="flex items-center gap-2.5 opacity-45">
            <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Minus className="w-2.5 h-2.5 text-white/40" />
            </div>
            <span className="text-white/60 text-xs">Don't Allow — most features won't work</span>
          </div>
        </div>

        <Button
          onClick={handleContinue}
          className="w-full bg-[#d4ff00] text-[#0a0118] hover:bg-[#d4ff00]/90 font-semibold text-base h-14 rounded-full"
        >
          Continue
        </Button>
        <p className="text-center text-white/25 text-xs mt-3">
          iOS will ask you to choose in the next step
        </p>
      </div>
    </div>
  );
}
