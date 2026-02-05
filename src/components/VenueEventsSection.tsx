 import { useState, useEffect } from 'react';
 import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
 import { supabase } from '@/integrations/supabase/client';
 import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
 import { useAuth } from '@/contexts/AuthContext';
 import { format, isToday, isTomorrow, differenceInDays } from 'date-fns';
 import { toast } from 'sonner';
 import { haptic } from '@/lib/haptics';
 import confetti from 'canvas-confetti';
 
 const formatTimeTo12Hour = (time: string) => {
   const [hours, minutes] = time.split(':').map(Number);
   const period = hours >= 12 ? 'PM' : 'AM';
   const hour12 = hours % 12 || 12;
   return `${hour12}${minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : ''}${period}`;
 };
 
 const getSmartEventDateLabel = (dateStr: string) => {
   const date = new Date(dateStr);
   if (isToday(date)) return 'Tonight';
   if (isTomorrow(date)) return 'Tomorrow';
   const daysAway = differenceInDays(date, new Date());
   if (daysAway > 0 && daysAway <= 7) return format(date, 'EEEE');
   return format(date, 'EEE, MMM d');
 };
 
 interface VenueEvent {
   id: string;
   title: string;
   event_date: string;
   start_time: string;
   cover_image_url: string | null;
   ticket_url: string | null;
 }
 
 interface FriendEventRsvp {
   id: string;
   display_name: string;
   avatar_url: string | null;
   rsvp_type: 'interested' | 'going';
 }
 
 interface VenueEventWithFriends extends VenueEvent {
   friendsInterested: FriendEventRsvp[];
 }
 
 interface VenueEventsSectionProps {
   venueId: string;
 }
 
 export function VenueEventsSection({ venueId }: VenueEventsSectionProps) {
   const { user } = useAuth();
   const { openFriendCard } = useFriendIdCard();
   const [venueEvents, setVenueEvents] = useState<VenueEventWithFriends[]>([]);
   const [userRsvps, setUserRsvps] = useState<Set<string>>(new Set());
 
   useEffect(() => {
     if (venueId && user) {
       fetchVenueEvents();
     }
   }, [venueId, user?.id]);
 
   const fetchVenueEvents = async () => {
     if (!venueId || !user) return;
 
     try {
       const today = new Date().toISOString().split('T')[0];
       
       // Fetch events for this venue
       const { data: events } = await supabase
         .from('events')
         .select('id, title, event_date, start_time, cover_image_url, ticket_url')
         .eq('venue_id', venueId)
         .gte('event_date', today)
         .gt('expires_at', new Date().toISOString())
         .order('event_date', { ascending: true })
         .limit(5);
 
       if (!events || events.length === 0) {
         setVenueEvents([]);
         return;
       }
 
       // Get RSVPs for these events
       const eventIds = events.map(e => e.id);
       const { data: rsvps } = await supabase
         .from('event_rsvps')
         .select('event_id, user_id, rsvp_type')
         .in('event_id', eventIds);
 
       // Track user's own RSVPs
       const userRsvpIds = new Set(
         (rsvps || []).filter(r => r.user_id === user.id).map(r => r.event_id)
       );
       setUserRsvps(userRsvpIds);
 
       // Get user's friends
       const { data: friendships } = await supabase
         .from('friendships')
         .select('friend_id, user_id')
         .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
         .eq('status', 'accepted');
 
       const friendIds = (friendships || []).map(f => f.user_id === user.id ? f.friend_id : f.user_id);
 
       // Filter to friend RSVPs only
       const friendRsvps = (rsvps || []).filter(r => friendIds.includes(r.user_id));
 
       // Get profiles for friends who RSVP'd
       const rsvpUserIds = [...new Set(friendRsvps.map(r => r.user_id))];
       let profileMap = new Map<string, { id: string; display_name: string; avatar_url: string | null }>();
       
       if (rsvpUserIds.length > 0) {
         const { data: profiles } = await supabase
           .rpc('get_profiles_safe')
           .in('id', rsvpUserIds);
         
         profileMap = new Map(
           (profiles || []).map((p: { id: string; display_name: string; avatar_url: string | null }) => [p.id, p])
         );
       }
 
       // Build events with friend data
       const eventsWithFriends: VenueEventWithFriends[] = events.map(event => {
         const eventFriendRsvps = friendRsvps.filter(r => r.event_id === event.id);
         const friendsInterested: FriendEventRsvp[] = eventFriendRsvps
           .map(r => {
             const profile = profileMap.get(r.user_id);
             if (!profile) return null;
             return {
               id: r.user_id,
               display_name: profile.display_name,
               avatar_url: profile.avatar_url,
               rsvp_type: r.rsvp_type as 'interested' | 'going',
             };
           })
           .filter((f): f is FriendEventRsvp => f !== null);
 
         return { ...event, friendsInterested };
       });
 
       setVenueEvents(eventsWithFriends);
     } catch (error) {
       console.error('Error fetching venue events:', error);
       setVenueEvents([]);
     }
   };
 
   const handleEventRsvp = async (eventId: string, isCurrentlyDown: boolean) => {
     if (!user) return;
     
     haptic.medium();
     
     try {
       if (isCurrentlyDown) {
         await supabase
           .from('event_rsvps')
           .delete()
           .eq('event_id', eventId)
           .eq('user_id', user.id);
         setUserRsvps(prev => {
           const next = new Set(prev);
           next.delete(eventId);
           return next;
         });
         toast.success('Removed from your events');
       } else {
         await supabase
           .from('event_rsvps')
           .insert({ 
             event_id: eventId, 
             user_id: user.id,
             rsvp_type: 'interested'
           });
         setUserRsvps(prev => new Set(prev).add(eventId));
         confetti({
           particleCount: 80,
           spread: 60,
           origin: { y: 0.7 },
           colors: ['#a855f7', '#d4ff00', '#ffffff'],
         });
         toast.success("You're down! 🎉");
       }
       fetchVenueEvents();
     } catch (error) {
       console.error('Error toggling event RSVP:', error);
       toast.error('Something went wrong');
     }
   };
 
   if (venueEvents.length === 0) {
     return null;
   }
 
   return (
     <div className="mb-4">
       <h4 className="text-sm font-semibold text-foreground mb-2">Upcoming Events</h4>
       <div className="space-y-2">
         {venueEvents.map((event) => {
           const isDown = userRsvps.has(event.id);
           
           return (
             <div
               key={event.id}
               className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20"
             >
               <div className="flex items-start justify-between">
                 <div className="flex-1 min-w-0">
                   <p className="text-foreground font-medium text-sm truncate">{event.title}</p>
                   <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                     <span>{getSmartEventDateLabel(event.event_date)}</span>
                     <span>•</span>
                     <span>{formatTimeTo12Hour(event.start_time)}</span>
                   </div>
                   
                   {/* Friend avatars */}
                   {event.friendsInterested.length > 0 && (
                     <div className="flex items-center gap-2 mt-2">
                       <div className="flex -space-x-1.5">
                         {event.friendsInterested.slice(0, 3).map((friend) => (
                           <Avatar 
                             key={friend.id} 
                             className="h-5 w-5 border border-background cursor-pointer hover:scale-110 transition-transform"
                             onClick={() => openFriendCard({
                               userId: friend.id,
                               displayName: friend.display_name,
                               avatarUrl: friend.avatar_url,
                             })}
                           >
                             <AvatarImage src={friend.avatar_url || ''} />
                             <AvatarFallback className="bg-purple-500/30 text-purple-300 text-[8px]">
                               {friend.display_name.charAt(0)}
                             </AvatarFallback>
                           </Avatar>
                         ))}
                       </div>
                       <span className="text-[10px] text-muted-foreground">
                         {event.friendsInterested.length} friend{event.friendsInterested.length > 1 ? 's' : ''} interested
                       </span>
                     </div>
                   )}
                 </div>
                 
                 <button
                   onClick={() => handleEventRsvp(event.id, isDown)}
                   className={`ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                     isDown
                       ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                       : 'bg-purple-500 text-primary-foreground hover:bg-purple-600'
                   }`}
                 >
                   {isDown ? "✓ Down" : "I'm Down"}
                 </button>
               </div>
             </div>
           );
         })}
       </div>
     </div>
   );
 }