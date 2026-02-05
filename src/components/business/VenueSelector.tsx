 import { useState, useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
 import { Building2 } from 'lucide-react';
 
 interface OwnedVenue {
   venue_id: string;
   role: string;
   venue: {
     id: string;
     name: string;
     neighborhood: string;
   };
 }
 
 interface VenueSelectorProps {
   selectedVenueId: string | null;
  onVenueChange: (venueId: string, venueName?: string) => void;
 }
 
 export function VenueSelector({ selectedVenueId, onVenueChange }: VenueSelectorProps) {
   const { user } = useAuth();
   const [venues, setVenues] = useState<OwnedVenue[]>([]);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     async function fetchOwnedVenues() {
       if (!user) return;
 
       try {
         const { data, error } = await supabase
           .from('venue_owners')
           .select(`
             venue_id,
             role,
             venue:venues (
               id,
               name,
               neighborhood
             )
           `)
           .eq('user_id', user.id);
 
         if (error) throw error;
 
         const ownedVenues = (data || []).filter(v => v.venue) as OwnedVenue[];
         setVenues(ownedVenues);
 
         // Auto-select first venue if none selected
         if (!selectedVenueId && ownedVenues.length > 0) {
          onVenueChange(ownedVenues[0].venue_id, ownedVenues[0].venue.name);
         }
       } catch (err) {
         console.error('Error fetching owned venues:', err);
       } finally {
         setLoading(false);
       }
     }
 
     fetchOwnedVenues();
   }, [user, selectedVenueId, onVenueChange]);
 
   if (loading) {
     return (
       <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
     );
   }
 
   if (venues.length === 0) {
     return (
       <div className="text-white/60 text-sm">No venues found</div>
     );
   }
 
   if (venues.length === 1) {
    // Auto-select the single venue if not already selected
    if (!selectedVenueId) {
      onVenueChange(venues[0].venue_id, venues[0].venue.name);
    }
     return (
       <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
         <Building2 className="h-4 w-4 text-primary" />
         <span className="text-white font-medium">{venues[0].venue.name}</span>
       </div>
     );
   }
 
  const handleValueChange = (venueId: string) => {
    const venue = venues.find(v => v.venue_id === venueId);
    onVenueChange(venueId, venue?.venue.name);
  };

   return (
    <Select value={selectedVenueId || ''} onValueChange={handleValueChange}>
       <SelectTrigger className="bg-white/5 border-white/10 text-white">
         <SelectValue placeholder="Select venue" />
       </SelectTrigger>
       <SelectContent className="bg-[#1a0f2e] border-white/10">
         {venues.map((v) => (
           <SelectItem
             key={v.venue_id}
             value={v.venue_id}
             className="text-white hover:bg-white/10"
           >
             {v.venue.name} ({v.venue.neighborhood})
           </SelectItem>
         ))}
       </SelectContent>
     </Select>
   );
 }