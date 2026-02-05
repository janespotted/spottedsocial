 import { useState } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { toast } from 'sonner';
 import { Search, MapPin, Loader2, CheckCircle } from 'lucide-react';
 
 interface Venue {
   id: string;
   name: string;
   neighborhood: string;
   city: string;
 }
 
 interface ClaimVenueFormProps {
   onSuccess?: () => void;
 }
 
 export function ClaimVenueForm({ onSuccess }: ClaimVenueFormProps) {
   const { user } = useAuth();
   const [searchQuery, setSearchQuery] = useState('');
   const [searchResults, setSearchResults] = useState<Venue[]>([]);
   const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
   const [businessEmail, setBusinessEmail] = useState('');
   const [businessPhone, setBusinessPhone] = useState('');
   const [notes, setNotes] = useState('');
   const [searching, setSearching] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const [submitted, setSubmitted] = useState(false);
 
   const handleSearch = async () => {
     if (searchQuery.trim().length < 2) return;
 
     setSearching(true);
     try {
       const { data, error } = await supabase
         .from('venues')
         .select('id, name, neighborhood, city')
         .ilike('name', `%${searchQuery}%`)
         .limit(10);
 
       if (error) throw error;
       setSearchResults(data || []);
     } catch (err) {
       console.error('Error searching venues:', err);
       toast.error('Failed to search venues');
     } finally {
       setSearching(false);
     }
   };
 
   const handleSubmit = async () => {
     if (!user || !selectedVenue || !businessEmail) {
       toast.error('Please fill in all required fields');
       return;
     }
 
     setSubmitting(true);
     try {
       const { error } = await supabase
         .from('venue_claim_requests')
         .insert({
           user_id: user.id,
           venue_id: selectedVenue.id,
           venue_name: selectedVenue.name,
           business_email: businessEmail,
           business_phone: businessPhone || null,
           verification_notes: notes || null,
         });
 
       if (error) throw error;
 
       setSubmitted(true);
       toast.success('Claim request submitted! We\'ll review it shortly.');
       onSuccess?.();
     } catch (err: any) {
       console.error('Error submitting claim:', err);
       if (err.code === '23505') {
         toast.error('You already have a pending claim for this venue');
       } else {
         toast.error('Failed to submit claim request');
       }
     } finally {
       setSubmitting(false);
     }
   };
 
   if (submitted) {
     return (
       <Card className="bg-white/5 border-white/10">
         <CardContent className="py-8 text-center">
           <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
           <h3 className="text-white font-semibold text-lg mb-2">
             Claim Submitted!
           </h3>
           <p className="text-white/60 text-sm">
             We'll review your claim and get back to you within 24-48 hours.
           </p>
         </CardContent>
       </Card>
     );
   }
 
   return (
     <Card className="bg-white/5 border-white/10">
       <CardHeader>
         <CardTitle className="text-white text-lg">Claim Your Venue</CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         {/* Venue Search */}
         {!selectedVenue ? (
           <>
             <div className="flex gap-2">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                 <Input
                   placeholder="Search for your venue..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                   className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40"
                 />
               </div>
               <Button
                 onClick={handleSearch}
                 disabled={searching || searchQuery.length < 2}
                 className="bg-primary hover:bg-primary/80"
               >
                 {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
               </Button>
             </div>
 
             {searchResults.length > 0 && (
               <div className="space-y-2 max-h-[200px] overflow-y-auto">
                 {searchResults.map((venue) => (
                   <button
                     key={venue.id}
                     onClick={() => setSelectedVenue(venue)}
                     className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left"
                   >
                     <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                     <div>
                       <div className="text-white font-medium">{venue.name}</div>
                       <div className="text-white/50 text-xs">
                         {venue.neighborhood} • {venue.city?.toUpperCase()}
                       </div>
                     </div>
                   </button>
                 ))}
               </div>
             )}
 
             {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
               <p className="text-white/50 text-sm text-center py-4">
                 No venues found. Contact us to add your venue.
               </p>
             )}
           </>
         ) : (
           <>
             {/* Selected Venue */}
             <div className="flex items-center justify-between p-3 rounded-lg bg-primary/20 border border-primary/30">
               <div className="flex items-center gap-3">
                 <MapPin className="h-4 w-4 text-primary" />
                 <div>
                   <div className="text-white font-medium">{selectedVenue.name}</div>
                   <div className="text-white/50 text-xs">{selectedVenue.neighborhood}</div>
                 </div>
               </div>
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => setSelectedVenue(null)}
                 className="text-white/60 hover:text-white"
               >
                 Change
               </Button>
             </div>
 
             {/* Business Info */}
             <div className="space-y-3">
               <div>
                 <label className="text-white/60 text-sm mb-1 block">
                   Business Email *
                 </label>
                 <Input
                   type="email"
                   placeholder="contact@yourvenue.com"
                   value={businessEmail}
                   onChange={(e) => setBusinessEmail(e.target.value)}
                   className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                 />
               </div>
 
               <div>
                 <label className="text-white/60 text-sm mb-1 block">
                   Business Phone (optional)
                 </label>
                 <Input
                   type="tel"
                   placeholder="(555) 123-4567"
                   value={businessPhone}
                   onChange={(e) => setBusinessPhone(e.target.value)}
                   className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                 />
               </div>
 
               <div>
                 <label className="text-white/60 text-sm mb-1 block">
                   Additional Notes (optional)
                 </label>
                 <Textarea
                   placeholder="Any additional info to help verify ownership..."
                   value={notes}
                   onChange={(e) => setNotes(e.target.value)}
                   className="bg-white/5 border-white/20 text-white placeholder:text-white/40 min-h-[80px]"
                 />
               </div>
             </div>
 
             <Button
               onClick={handleSubmit}
               disabled={submitting || !businessEmail}
               className="w-full bg-primary hover:bg-primary/80"
             >
               {submitting ? (
                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
               ) : null}
               Submit Claim Request
             </Button>
           </>
         )}
       </CardContent>
     </Card>
   );
 }