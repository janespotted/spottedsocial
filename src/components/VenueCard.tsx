import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, TrendingUp } from 'lucide-react';

interface VenueCardProps {
  open: boolean;
  onClose: () => void;
  venue: {
    id: string;
    name: string;
    neighborhood: string;
    type: string;
    heatScore: number;
  };
  friendsAtVenue: Array<{
    id: string;
    display_name: string;
    avatar_url: string | null;
  }>;
}

export function VenueCard({ open, onClose, venue, friendsAtVenue }: VenueCardProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-[#2d1b4e]/95 backdrop-blur-lg border-[#a855f7]/30 text-white">
        <div className="space-y-4">
          {/* Venue Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#a855f7]" />
              <h2 className="text-2xl font-bold">{venue.name}</h2>
            </div>
            <p className="text-white/60">{venue.neighborhood} • {venue.type}</p>
          </div>

          {/* Heat Score */}
          <div className="flex items-center gap-2 p-3 bg-[#a855f7]/20 rounded-lg border border-[#a855f7]/30">
            <TrendingUp className="w-5 h-5 text-[#a855f7]" />
            <div>
              <p className="text-sm text-white/60">Heat Score</p>
              <p className="text-lg font-bold">{venue.heatScore}</p>
            </div>
          </div>

          {/* Friends at Venue */}
          {friendsAtVenue.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-white/60">{friendsAtVenue.length} friends here</p>
              <div className="flex flex-wrap gap-2">
                {friendsAtVenue.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-2 p-2 bg-[#a855f7]/10 rounded-lg border border-[#a855f7]/20">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} />
                      <AvatarFallback>{friend.display_name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{friend.display_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          <Button 
            onClick={onClose}
            className="w-full bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
