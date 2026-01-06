import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Plus, ChevronRight } from 'lucide-react';
import { VenueMatch } from '@/lib/location-service';
import { haptic } from '@/lib/haptics';

interface VenueCorrectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nearbyVenues: VenueMatch[];
  onSelectVenue: (venue: VenueMatch) => void;
  onAddNewVenue: () => void;
  currentVenueId?: string;
}

export function VenueCorrectionSheet({
  open,
  onOpenChange,
  nearbyVenues,
  onSelectVenue,
  onAddNewVenue,
  currentVenueId,
}: VenueCorrectionSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredVenues = nearbyVenues.filter(
    (venue) =>
      venue.id !== currentVenueId &&
      venue.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectVenue = (venue: VenueMatch) => {
    haptic.light();
    onSelectVenue(venue);
    onOpenChange(false);
  };

  const handleAddNew = () => {
    haptic.light();
    onAddNewVenue();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="bg-gradient-to-b from-[#2d1b4e] to-[#1a0f2e] border-t border-[#a855f7]/40 rounded-t-3xl h-[70vh]"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white text-xl">Select Correct Venue</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            placeholder="Search venues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>

        {/* Venue List */}
        <div className="space-y-2 overflow-y-auto max-h-[calc(70vh-180px)]">
          {filteredVenues.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/50 text-sm mb-4">No venues found nearby</p>
            </div>
          ) : (
            filteredVenues.map((venue) => (
              <button
                key={venue.id}
                onClick={() => handleSelectVenue(venue)}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-[#a855f7]" />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium">{venue.name}</p>
                    <p className="text-white/50 text-sm">
                      {Math.round(venue.distance)}m away
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-white/40" />
              </button>
            ))
          )}
        </div>

        {/* Add New Venue Button */}
        <div className="pt-4 border-t border-white/10 mt-4">
          <Button
            variant="outline"
            onClick={handleAddNew}
            className="w-full h-12 border-dashed border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add a new venue
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
