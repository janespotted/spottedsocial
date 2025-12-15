import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MapPin, X } from 'lucide-react';
import { getAudienceLabel, suppressVenueTonight } from '@/lib/venue-arrival-nudge';

interface VenueArrivalToastProps {
  venueName: string;
  venueId: string;
  locationSharingLevel: string;
  onChangeAudience: () => void;
}

export function showVenueArrivalToast({
  venueName,
  venueId,
  locationSharingLevel,
  onChangeAudience,
}: VenueArrivalToastProps) {
  toast.custom(
    (t) => (
      <div className="bg-gradient-to-r from-[#2d1b4e] to-[#1a0f2e] border border-[#a855f7]/40 rounded-2xl p-4 shadow-[0_0_20px_rgba(168,85,247,0.3)] max-w-[360px] w-full">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="h-5 w-5 text-[#a855f7]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-base">You're at {venueName}</p>
            <p className="text-sm text-white/60 mt-0.5">
              Sharing location with: {getAudienceLabel(locationSharingLevel)}
            </p>
          </div>
          <button
            onClick={() => toast.dismiss(t)}
            className="text-white/40 hover:text-white/60 transition-colors p-1 -mr-1 -mt-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={() => toast.dismiss(t)}
            className="flex-1 bg-[#a855f7] hover:bg-[#9333ea] text-white rounded-xl h-9"
          >
            Looks right
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              toast.dismiss(t);
              onChangeAudience();
            }}
            className="flex-1 border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20 rounded-xl h-9"
          >
            Change who can see
          </Button>
        </div>

        {/* Not here link */}
        <button
          onClick={() => {
            suppressVenueTonight(venueId);
            toast.dismiss(t);
          }}
          className="text-xs text-white/40 hover:text-white/60 mt-3 transition-colors w-full text-center"
        >
          Not here
        </button>
      </div>
    ),
    {
      duration: 5000,
      position: 'bottom-center',
    }
  );
}
