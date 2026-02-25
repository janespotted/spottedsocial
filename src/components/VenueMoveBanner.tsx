import { useEffect, useRef } from 'react';
import { MapPin, X, ChevronRight } from 'lucide-react';

interface VenueMoveBannerProps {
  venue: { id: string; name: string };
  hasMultipleNearby: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onSomewhereElse: () => void;
}

export function VenueMoveBanner({ venue, hasMultipleNearby, onAccept, onDismiss, onSomewhereElse }: VenueMoveBannerProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Auto-dismiss after 10 seconds
    timerRef.current = setTimeout(onDismiss, 10000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div className="bg-gradient-to-r from-[#2d1b4e]/90 to-[#1a0f2e]/90 backdrop-blur border border-[#a855f7]/30 rounded-xl px-3 py-2.5 flex items-center gap-2 animate-fade-in">
      <MapPin className="w-3.5 h-3.5 text-[#d4ff00] shrink-0" />
      <span className="text-white/70 text-xs">Moved to a new spot?</span>
      <button
        onClick={onAccept}
        className="px-2.5 py-1 bg-[#d4ff00] text-[#0a0118] text-xs font-semibold rounded-full hover:bg-[#d4ff00]/90 transition-colors shrink-0"
      >
        {venue.name}
      </button>
      {hasMultipleNearby && (
        <button
          onClick={onSomewhereElse}
          className="text-[#a855f7] text-[10px] hover:text-[#c084fc] transition-colors whitespace-nowrap flex items-center"
        >
          or somewhere else <ChevronRight className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={onDismiss}
        className="text-white/30 hover:text-white/60 transition-colors ml-auto shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
