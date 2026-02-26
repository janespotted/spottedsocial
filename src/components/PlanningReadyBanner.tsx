import { Sparkles, X } from 'lucide-react';

interface PlanningReadyBannerProps {
  onGoOut: () => void;
  onDismiss: () => void;
}

export function PlanningReadyBanner({ onGoOut, onDismiss }: PlanningReadyBannerProps) {
  return (
    <div className="bg-gradient-to-r from-[#a855f7]/20 to-[#d4ff00]/10 backdrop-blur-sm rounded-xl px-3 py-2.5 flex items-center gap-2 animate-fade-in">
      <Sparkles className="w-3.5 h-3.5 text-[#d4ff00] shrink-0" />
      <span className="text-white/70 text-xs">Ready to go?</span>
      <button
        onClick={onGoOut}
        className="px-2.5 py-1 bg-[#d4ff00] text-[#0a0118] text-xs font-semibold rounded-full hover:bg-[#d4ff00]/90 transition-colors"
      >
        I'm out
      </button>
      <button
        onClick={onDismiss}
        className="text-white/30 hover:text-white/60 transition-colors ml-auto shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
