 import { useState, useEffect } from 'react';
 import { Calendar, Clock, MapPin, Ticket, Share2, ExternalLink } from 'lucide-react';
 import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { supabase } from '@/integrations/supabase/client';
 import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
 import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
 import { format, isToday, isTomorrow, differenceInDays } from 'date-fns';
 import { toast } from 'sonner';
 import { haptic } from '@/lib/haptics';
 import { APP_BASE_URL, openExternalUrl } from '@/lib/platform';
 import confetti from 'canvas-confetti';
 
 const formatTimeTo12Hour = (time: string) => {
   const [hours, minutes] = time.split(':').map(Number);
   const period = hours >= 12 ? 'PM' : 'AM';
   const hour12 = hours % 12 || 12;
   return `${hour12}${minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : ''}${period}`;
 };
 
 const getSmartDateLabel = (dateStr: string) => {
   const date = new Date(dateStr);
   if (isToday(date)) return 'Tonight';
   if (isTomorrow(date)) return 'Tomorrow';
   const daysAway = differenceInDays(date, new Date());
   if (daysAway > 0 && daysAway <= 7) return format(date, 'EEEE');
   return format(date, 'EEE, MMM d');
 };
 
 interface FriendRsvp {
   id: string;
   display_name: string;
   avatar_url: string | null;
   rsvp_type: 'interested' | 'going';
 }
 
 interface EventCardProps {
   event: {
     id: string;
     venue_id: string | null;
     venue_name: string;
     title: string;
     description?: string | null;
     event_date: string;
     start_time: string;
     end_time?: string | null;
     cover_image_url?: string | null;
     ticket_url?: string | null;
     city?: string | null;
     neighborhood?: string | null;
   };
   currentUserId: string;
   friendsInterested: FriendRsvp[];
   onRsvpChange?: () => void;
 }
 
 export function EventCard({ event, currentUserId, friendsInterested, onRsvpChange }: EventCardProps) {
   const [isDown, setIsDown] = useState(false);
   const [isTogglingDown, setIsTogglingDown] = useState(false);
   const { openFriendCard } = useFriendIdCard();
   const { openVenueCard } = useVenueIdCard();
 
   useEffect(() => {
     checkUserRsvp();
   }, [event.id, currentUserId]);
 
   const checkUserRsvp = async () => {
     const { data } = await supabase
       .from('event_rsvps')
       .select('id')
       .eq('event_id', event.id)
       .eq('user_id', currentUserId)
       .maybeSingle();
     
     setIsDown(!!data);
   };
 
   const triggerConfetti = () => {
     confetti({
       particleCount: 80,
       spread: 60,
       origin: { y: 0.7 },
       colors: ['#a855f7', '#d4ff00', '#ffffff'],
     });
   };
 
   const handleToggleDown = async () => {
     if (isTogglingDown) return;
     setIsTogglingDown(true);
     haptic.medium();
 
     try {
       if (isDown) {
         await supabase
           .from('event_rsvps')
           .delete()
           .eq('event_id', event.id)
           .eq('user_id', currentUserId);
         setIsDown(false);
         toast.success('Removed from your events');
       } else {
         await supabase
           .from('event_rsvps')
           .insert({ 
             event_id: event.id, 
             user_id: currentUserId,
             rsvp_type: 'interested'
           });
         setIsDown(true);
         triggerConfetti();
         toast.success("You're down! 🎉");
       }
       onRsvpChange?.();
     } catch (error) {
       console.error('Error toggling RSVP:', error);
       toast.error('Something went wrong');
     } finally {
       setIsTogglingDown(false);
     }
   };
 
   const handleVenueClick = () => {
     if (event.venue_id) {
       openVenueCard(event.venue_id);
     }
   };
 
   const handleShare = async () => {
     haptic.light();
     try {
       await navigator.share({
         title: event.title,
         text: `Check out ${event.title} at ${event.venue_name}!`,
         url: event.ticket_url || APP_BASE_URL,
       });
     } catch {
       // User cancelled or share not supported
     }
   };
 
   const handleTicket = () => {
     if (event.ticket_url) {
       haptic.light();
       openExternalUrl(event.ticket_url);
     }
   };
 
   const smartDateLabel = getSmartDateLabel(event.event_date);
   const formattedTime = formatTimeTo12Hour(event.start_time);
   const goingCount = friendsInterested.filter(f => f.rsvp_type === 'going').length;
   const interestedCount = friendsInterested.length;
 
   return (
     <div className="relative bg-gradient-to-br from-purple-500/10 via-background to-pink-500/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-purple-500/20 transition-all duration-300">
       {/* Event badge */}
       <Badge 
         className="absolute top-3 left-3 z-10 bg-purple-500/80 text-white border-0 text-[10px] font-bold tracking-wider"
       >
         🎉 EVENT
       </Badge>
 
       {/* Action buttons */}
       <div className="absolute top-3 right-3 z-10 flex gap-2">
         <Button
           variant="ghost"
           size="icon"
           className="h-8 w-8 bg-background/50 backdrop-blur-sm hover:bg-background/70"
           onClick={handleShare}
         >
           <Share2 className="w-4 h-4" />
         </Button>
         {event.ticket_url && (
           <Button
             variant="ghost"
             size="icon"
             className="h-8 w-8 bg-background/50 backdrop-blur-sm hover:bg-background/70"
             onClick={handleTicket}
           >
             <Ticket className="w-4 h-4" />
           </Button>
         )}
       </div>
 
       {/* Cover image */}
       {event.cover_image_url && (
         <div className="relative h-32 w-full">
           <img 
             src={event.cover_image_url} 
             alt={event.title}
             className="w-full h-full object-cover"
           />
           <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
         </div>
       )}
 
       {/* Content */}
       <div className={`p-4 ${event.cover_image_url ? '-mt-8 relative' : 'pt-12'}`}>
         {/* Title */}
         <h3 className="text-lg font-bold text-foreground mb-1 pr-16">
           {event.title}
         </h3>
 
         {/* Venue */}
         <button 
           className="text-sm font-medium text-[#d4ff00] hover:text-[#e8ff4d] cursor-pointer flex items-center gap-1.5 transition-colors mb-2"
           onClick={handleVenueClick}
         >
           <MapPin className="w-3.5 h-3.5 text-white/50" />
           {event.venue_name}
         </button>
 
         {/* Date & Time */}
         <div className="flex items-center gap-3 text-xs text-white/70 mb-3">
           <div className="flex items-center gap-1.5">
             <Calendar className="w-3 h-3 text-white/50" />
             <span className="font-semibold text-white">{smartDateLabel}</span>
           </div>
           <div className="flex items-center gap-1.5">
             <Clock className="w-3 h-3 text-white/50" />
             <span>{formattedTime}</span>
             {event.end_time && (
               <span className="text-white/40">- {formatTimeTo12Hour(event.end_time)}</span>
             )}
           </div>
         </div>
 
         {/* Description */}
         {event.description && (
           <p className="text-sm text-foreground/80 mb-3 line-clamp-2">
             {event.description}
           </p>
         )}
 
         {/* Friends interested */}
         {friendsInterested.length > 0 && (
           <div className="flex items-center gap-2 mb-3">
             <div className="flex -space-x-2">
               {friendsInterested.slice(0, 5).map((friend) => (
                 <Avatar 
                   key={friend.id} 
                   className="h-7 w-7 border-2 border-background cursor-pointer hover:scale-110 transition-transform"
                   onClick={() => openFriendCard({
                     userId: friend.id,
                     displayName: friend.display_name,
                     avatarUrl: friend.avatar_url,
                   })}
                 >
                   <AvatarImage src={friend.avatar_url || ''} />
                   <AvatarFallback className="bg-purple-500/20 text-purple-400 text-[10px]">
                     {friend.display_name.charAt(0)}
                   </AvatarFallback>
                 </Avatar>
               ))}
               {friendsInterested.length > 5 && (
                 <div className="h-7 w-7 rounded-full bg-purple-500/20 border-2 border-background flex items-center justify-center">
                   <span className="text-[10px] text-purple-400 font-medium">+{friendsInterested.length - 5}</span>
                 </div>
               )}
             </div>
             <span className="text-xs text-white/60">
               {goingCount > 0 
                 ? `${goingCount} friend${goingCount > 1 ? 's' : ''} going`
                 : `${interestedCount} friend${interestedCount > 1 ? 's' : ''} interested`
               }
             </span>
           </div>
         )}
 
         {/* I'm Down button */}
         <button
           onClick={handleToggleDown}
           disabled={isTogglingDown}
           className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
             isDown
               ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
               : 'bg-purple-500 text-white hover:bg-purple-600'
           }`}
         >
           {isDown ? "✓ I'm Down" : "I'm Down"}
         </button>
       </div>
     </div>
   );
 }