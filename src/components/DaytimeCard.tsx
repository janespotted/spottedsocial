import { Clock, MapPin, Sparkles } from 'lucide-react';
import { useCheckIn } from '@/contexts/CheckInContext';
import { Button } from '@/components/ui/button';

interface DaytimeCardProps {
  planningFriendsCount?: number;
}

export function DaytimeCard({ planningFriendsCount = 0 }: DaytimeCardProps) {
  const { openCheckIn } = useCheckIn();

  return (
    <div className="glass-card rounded-3xl p-6 border border-[#a855f7]/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-[#a855f7]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Tonight's Plans</h3>
          <p className="text-white/50 text-sm">The night starts at 5pm</p>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3 text-white/70">
          <Clock className="w-4 h-4" />
          <span className="text-sm">Check-in opens at 5pm</span>
        </div>
        {planningFriendsCount > 0 && (
          <div className="flex items-center gap-3 text-[#d4ff00]">
            <MapPin className="w-4 h-4" />
            <span className="text-sm font-medium">
              {planningFriendsCount} friend{planningFriendsCount !== 1 ? 's' : ''} planning tonight
            </span>
          </div>
        )}
      </div>

      <Button
        onClick={openCheckIn}
        variant="outline"
        className="w-full border-[#a855f7]/30 text-white hover:bg-[#a855f7]/10"
      >
        Set your status early
      </Button>
    </div>
  );
}
