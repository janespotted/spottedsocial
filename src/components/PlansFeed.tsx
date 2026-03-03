import { useState, useEffect } from 'react';
import { Calendar, Plus, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PlanItem } from './PlanItem';
import { CreatePlanDialog } from './CreatePlanDialog';
import { CreateEventDialog } from './CreateEventDialog';
import { EditPlanDialog } from './EditPlanDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoMode } from '@/hooks/useDemoMode';
import { FriendsPlanning } from './FriendsPlanning';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '@/lib/haptics';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useUserCity } from '@/hooks/useUserCity';
import { EventCard } from './EventCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { isWeekendDate, getWeekendDateRange } from '@/hooks/useWeekendRally';
interface Plan {
  id: string;
  user_id: string;
  venue_id: string | null;
  venue_name: string;
  plan_date: string;
  plan_time: string;
  description: string;
  visibility: string;
  score: number;
  comments_count: number;
  created_at: string;
  user?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

 interface Event {
   id: string;
   venue_id: string | null;
   venue_name: string;
   title: string;
   description: string | null;
   event_date: string;
   start_time: string;
   end_time: string | null;
   cover_image_url: string | null;
   ticket_url: string | null;
   city: string | null;
   neighborhood: string | null;
 }
 
 interface FriendRsvp {
   id: string;
   display_name: string;
   avatar_url: string | null;
   rsvp_type: 'interested' | 'going';
 }
 
 interface EventWithFriends extends Event {
   friendsInterested: FriendRsvp[];
 }
 
 type FeedItem = 
   | { type: 'plan'; data: Plan }
   | { type: 'event'; data: EventWithFriends };
 
interface PlansFeedProps {
  userId: string;
  weekendFilter?: boolean;
  onClearWeekendFilter?: () => void;
}

export function PlansFeed({ userId, weekendFilter = false, onClearWeekendFilter }: PlansFeedProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
   const [events, setEvents] = useState<EventWithFriends[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateEventDialog, setShowCreateEventDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);
  const [isUserPlanning, setIsUserPlanning] = useState(false);
  const [isUserOut, setIsUserOut] = useState(false);
  const [userProfile, setUserProfile] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const [userPlanningNeighborhood, setUserPlanningNeighborhood] = useState<string | null>(null);
  const [userPlanningVisibility, setUserPlanningVisibility] = useState<string | null>(null);
  const demoEnabled = useDemoMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { openCheckIn } = useCheckIn();
  const { city } = useUserCity();

  const fetchPlanningFriends = async () => {
    if (!userId) return;
    
    try {
      // Fetch user profile and status in parallel
      const [userStatusResult, userProfileResult] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('status, planning_neighborhood, planning_visibility')
          .eq('user_id', userId)
          .gte('expires_at', new Date().toISOString())
          .maybeSingle(),
        supabase
          .rpc('get_profile_safe', { target_user_id: userId })
          .maybeSingle()
      ]);
      
      const userStatus = userStatusResult.data;
      setIsUserPlanning(userStatus?.status === 'planning');
      setIsUserOut(userStatus?.status === 'out');
      setUserPlanningNeighborhood(userStatus?.planning_neighborhood || null);
      setUserPlanningVisibility(userStatus?.planning_visibility || null);
      
      if (userProfileResult.data) {
        setUserProfile({
          display_name: userProfileResult.data.display_name,
          avatar_url: userProfileResult.data.avatar_url
        });
      }

      // Demo mode shortcut: directly query demo planning statuses
      if (demoEnabled) {
        const { data: demoStatuses } = await supabase
          .from('night_statuses')
          .select('user_id, planning_neighborhood')
          .eq('status', 'planning')
          .eq('is_demo', true)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString());

        if (!demoStatuses || demoStatuses.length === 0) {
          setPlanningFriends([]);
        } else {
          const demoUserIds = demoStatuses.map(s => s.user_id);
          const neighborhoodMap = new Map(demoStatuses.map(s => [s.user_id, s.planning_neighborhood]));
          const { data: demoProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', demoUserIds);

          setPlanningFriends((demoProfiles || []).map((p: any) => ({
            user_id: p.id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            planning_neighborhood: neighborhoodMap.get(p.id) || null,
          })));
        }
        return;
      }

      // Get user's friends
      const { data: friendships } = await supabase
        .from('friendships')
        .select('friend_id, user_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (!friendships || friendships.length === 0) {
        setPlanningFriends([]);
        return;
      }

      const friendIds = friendships.map(f => f.user_id === userId ? f.friend_id : f.user_id);

      // Get friends who are planning
      const { data: planningStatuses } = await supabase
        .from('night_statuses')
        .select('user_id, planning_neighborhood')
        .in('user_id', friendIds)
        .eq('status', 'planning')
        .eq('is_demo', false)
        .gte('expires_at', new Date().toISOString());

      if (!planningStatuses || planningStatuses.length === 0) {
        setPlanningFriends([]);
        return;
      }

      const planningUserIds = planningStatuses.map(s => s.user_id);
      
      // Get profiles for planning friends using cache
      const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
      const profiles = allProfiles.filter((p: any) => planningUserIds.includes(p.id));

      if (profiles.length > 0) {
        const friendsWithNeighborhood = profiles.map(p => ({
          user_id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          planning_neighborhood: planningStatuses.find(s => s.user_id === p.id)?.planning_neighborhood
        }));
        setPlanningFriends(friendsWithNeighborhood);
      }
    } catch (error) {
      console.error('Error fetching planning friends:', error);
    }
  };

   const fetchEvents = async () => {
     if (!userId) return;
     
     try {
       // Get user's friends
       const { data: friendships } = await supabase
         .from('friendships')
         .select('friend_id, user_id')
         .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
         .eq('status', 'accepted');
 
       if (!friendships || friendships.length === 0) {
         setEvents([]);
         return;
       }
 
       const friendIds = friendships.map(f => f.user_id === userId ? f.friend_id : f.user_id);
 
       // Fetch upcoming events (today and future)
       const today = new Date().toISOString().split('T')[0];
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .gte('event_date', today)
          .gt('expires_at', new Date().toISOString())
          .eq('is_demo', false)
          .eq('city', city)
          .order('event_date', { ascending: true });
 
       if (!eventsData || eventsData.length === 0) {
         setEvents([]);
         return;
       }
 
       // Get RSVPs for these events
       const eventIds = eventsData.map(e => e.id);
       const { data: rsvps } = await supabase
         .from('event_rsvps')
         .select('event_id, user_id, rsvp_type')
         .in('event_id', eventIds);
 
       if (!rsvps || rsvps.length === 0) {
         setEvents([]);
         return;
       }
 
       // Filter to friend RSVPs only
       const friendRsvps = rsvps.filter(r => friendIds.includes(r.user_id));
       
       if (friendRsvps.length === 0) {
         setEvents([]);
         return;
       }
 
       // Get profiles for friends who RSVP'd using cache
       const rsvpUserIds = [...new Set(friendRsvps.map(r => r.user_id))];
       const allEventProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
       const eventProfiles = allEventProfiles.filter((p: any) => rsvpUserIds.includes(p.id));
 
       const profileMap = new Map(
         eventProfiles.map((p: { id: string; display_name: string; avatar_url: string | null }) => [p.id, p])
       );
 
       // Build events with friend data, only include events with friend RSVPs
       const eventsWithFriends: EventWithFriends[] = [];
       
       for (const event of eventsData) {
         const eventFriendRsvps = friendRsvps.filter(r => r.event_id === event.id);
         
         if (eventFriendRsvps.length > 0) {
           const friendsInterested: FriendRsvp[] = eventFriendRsvps
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
             .filter((f): f is FriendRsvp => f !== null);
 
           if (friendsInterested.length > 0) {
             eventsWithFriends.push({
               ...event,
               friendsInterested,
             });
           }
         }
       }
 
       // Sort by friend count (desc)
       eventsWithFriends.sort((a, b) => b.friendsInterested.length - a.friendsInterested.length);
       
       setEvents(eventsWithFriends);
     } catch (error) {
       console.error('Error fetching events:', error);
       setEvents([]);
     }
   };
 
  const handleChangeNeighborhood = async (neighborhood: string) => {
    if (!userId) return;
    
    try {
      const { error } = await supabase
        .from('night_statuses')
        .update({
          planning_neighborhood: neighborhood,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      haptic.light();
      setUserPlanningNeighborhood(neighborhood);
    } catch (error) {
      console.error('Error changing neighborhood:', error);
      toast({
        title: "Something went wrong",
        description: "Couldn't update your neighborhood. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleSwitchToOut = () => {
    openCheckIn();
  };

  const handleJoinPlanning = async () => {
    if (!userId) return;
    
    try {
      // Calculate 5am expiry
      const now = new Date();
      const expiry = new Date(now);
      if (now.getHours() >= 5) {
        expiry.setDate(expiry.getDate() + 1);
      }
      expiry.setHours(5, 0, 0, 0);

      const { error } = await supabase
        .from('night_statuses')
        .upsert({
          user_id: userId,
          status: 'planning',
          updated_at: new Date().toISOString(),
          expires_at: expiry.toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      haptic.light();
      setIsUserPlanning(true);
      toast({
        title: "You're in planning mode — friends can see you're making plans to go out tonight.",
      });
    } catch (error) {
      console.error('Error joining planning mode:', error);
      toast({
        title: "Something went wrong",
        description: "Couldn't update your status. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleLeavePlanning = async () => {
    if (!userId) return;
    
    try {
      const { error } = await supabase
        .from('night_statuses')
        .update({
          status: 'off',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      haptic.light();
      setIsUserPlanning(false);
      toast({
        title: "Exited planning mode",
        description: "Your status has been updated.",
      });
    } catch (error) {
      console.error('Error leaving planning mode:', error);
      toast({
        title: "Something went wrong",
        description: "Couldn't update your status. Try again.",
        variant: "destructive",
      });
    }
  };

  const fetchPlans = async () => {
    try {
      // Fetch plans that haven't expired
      let plansQuery = supabase
        .from('plans')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('score', { ascending: false })
        .order('created_at', { ascending: false });

      if (!demoEnabled) {
        plansQuery = plansQuery.eq('is_demo', false);
      }

      const { data: plansData, error: plansError } = await plansQuery;

      if (plansError) throw plansError;

      if (!plansData || plansData.length === 0) {
        setPlans([]);
        setIsLoading(false);
        return;
      }

      // Fetch user profiles for plans using cache
      const userIds = [...new Set(plansData.map(p => p.user_id))];
      const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
      const profiles = allProfiles.filter((p: any) => userIds.includes(p.id));

      // Fetch user's votes
      const { data: votesData } = await supabase
        .from('plan_votes')
        .select('plan_id, vote_type')
        .eq('user_id', userId);

      const votesMap: Record<string, 'up' | 'down'> = {};
      votesData?.forEach(v => {
        votesMap[v.plan_id] = v.vote_type as 'up' | 'down';
      });
      setUserVotes(votesMap);

      // Combine plans with user data
      const plansWithUsers = plansData.map(plan => ({
        ...plan,
        user: profiles?.find(p => p.id === plan.user_id)
      }));

      setPlans(plansWithUsers);
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    fetchPlanningFriends();
     fetchEvents();
  }, [userId, demoEnabled]);

  // Realtime subscription for plans and plan_downs
  useEffect(() => {
    const channel = supabase
      .channel('plans-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plans' },
        () => fetchPlans()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plan_downs' },
        () => fetchPlans()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, demoEnabled]);

  const handlePlanCreated = () => {
    setShowCreateDialog(false);
    fetchPlans();
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
  };

  const handleDeletePlan = (planId: string) => {
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  const handlePlanUpdated = () => {
    setEditingPlan(null);
    fetchPlans();
  };

   const handleEventRsvpChange = () => {
     fetchEvents();
   };
 
   // Build merged feed items with optional weekend filtering
   let feedItems: FeedItem[] = [
     ...plans.map(plan => ({ type: 'plan' as const, data: plan })),
     ...events.map(event => ({ type: 'event' as const, data: event })),
   ];

   // Apply weekend filter if active
   if (weekendFilter) {
     feedItems = feedItems.filter(item => {
       if (item.type === 'plan') {
         return isWeekendDate(item.data.plan_date);
       } else {
         return isWeekendDate(item.data.event_date);
       }
     });
   }
 
   // Sort: events by friend count, plans by score, interleave naturally
   feedItems.sort((a, b) => {
     // Events with more friends first
     if (a.type === 'event' && b.type === 'event') {
       return b.data.friendsInterested.length - a.data.friendsInterested.length;
     }
     if (a.type === 'plan' && b.type === 'plan') {
       return b.data.score - a.data.score;
     }
     // Mix events with plans - events with 2+ friends go higher
     if (a.type === 'event' && b.type === 'plan') {
       return a.data.friendsInterested.length >= 2 ? -1 : 1;
     }
     if (a.type === 'plan' && b.type === 'event') {
       return b.data.friendsInterested.length >= 2 ? 1 : -1;
     }
     return 0;
   });

   // Count friends planning for this weekend
   const weekendPlanningFriendsCount = planningFriends.length;
 
  if (isLoading) {
    return (
      <div className="space-y-5 px-4">
        {[1, 2, 3].map(i => (
          <div 
            key={i} 
            className="glass-card rounded-2xl overflow-hidden"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="p-4 space-y-4">
              {/* User info skeleton */}
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full shimmer" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-28 rounded-full shimmer" />
                  <div className="h-3 w-20 rounded-full shimmer" />
                </div>
                <div className="h-3 w-12 rounded-full shimmer" />
              </div>
              {/* Content skeleton */}
              <div className="space-y-2">
                <div className="h-4 w-full rounded-full shimmer" />
                <div className="h-4 w-3/4 rounded-full shimmer" />
              </div>
              {/* Actions skeleton */}
              <div className="flex items-center gap-4">
                <div className="h-8 w-16 rounded-full shimmer" />
                <div className="h-8 w-16 rounded-full shimmer" />
                <div className="ml-auto h-8 w-8 rounded-full shimmer" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-7 px-4 pb-24">
      {/* Weekend Rally Header - shown when activated via push notification */}
      {weekendFilter && (
        <div className="bg-gradient-to-br from-[#a855f7]/20 to-[#7c3aed]/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#d4ff00]" />
              <h3 className="text-white font-semibold text-lg">This Weekend</h3>
            </div>
            <button
              onClick={onClearWeekendFilter}
              className="text-white/50 hover:text-white text-sm transition-colors"
            >
              Show all
            </button>
          </div>
          
          {weekendPlanningFriendsCount > 0 ? (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex -space-x-2">
                {planningFriends.slice(0, 4).map((friend, i) => (
                  <Avatar key={friend.user_id} className="h-8 w-8 border-2 border-[#1a0f2e]">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                      {friend.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {planningFriends.length > 4 && (
                  <div className="h-8 w-8 rounded-full bg-[#2d1b4e] border-2 border-[#1a0f2e] flex items-center justify-center">
                    <span className="text-white/70 text-xs">+{planningFriends.length - 4}</span>
                  </div>
                )}
              </div>
              <span className="text-white/70 text-sm">
                {weekendPlanningFriendsCount} friend{weekendPlanningFriendsCount !== 1 ? 's' : ''} making plans
              </span>
            </div>
          ) : (
            <p className="text-white/50 text-sm mb-4">No friends planning yet — be the first!</p>
          )}
          
          {!isUserPlanning && (
            <button
              onClick={handleJoinPlanning}
              className="w-full flex items-center justify-center gap-2 bg-[#a855f7] hover:bg-[#9333ea] text-white py-3 rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              I'm thinking too
            </button>
          )}
        </div>
      )}

      {/* Friends Thinking About Going Out Section - hide in weekend mode */}
      {!weekendFilter && (
        <FriendsPlanning 
          friends={planningFriends} 
          variant="card" 
          isUserPlanning={isUserPlanning}
          isUserOut={isUserOut}
          onJoinPlanning={handleJoinPlanning}
          onLeavePlanning={handleLeavePlanning}
          showJoinOption={true}
          userProfile={userProfile}
          userPlanningNeighborhood={userPlanningNeighborhood}
          userPlanningVisibility={userPlanningVisibility}
          onChangeNeighborhood={handleChangeNeighborhood}
          onSwitchToOut={handleSwitchToOut}
          city={city || 'la'}
        />
      )}
      
      {/* Subtle separator */}
      {!weekendFilter && <div className="h-px bg-white/10" />}

      {/* Drop a Plan Section */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h3 className="text-white font-semibold text-base">
              {weekendFilter ? 'Make Weekend Plans' : 'Share Plans'}
            </h3>
          </div>
          <p className="text-white/50 text-xs mt-1 ml-7">Post a specific plan or event your friends can join</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white/[0.06] backdrop-blur-sm hover:bg-white/[0.10] text-white/80 hover:text-white py-3.5 rounded-xl transition-all duration-200 shadow-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm font-medium tracking-tight">Share a plan</span>
          </button>
          <button
            onClick={() => setShowCreateEventDialog(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white/[0.06] backdrop-blur-sm hover:bg-white/[0.10] text-white/80 hover:text-white py-3.5 rounded-xl transition-all duration-200 shadow-sm"
          >
            <Calendar className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm font-medium tracking-tight">Add event</span>
          </button>
        </div>
      </div>

       {feedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mb-5">
            <Calendar className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            {weekendFilter ? 'No weekend plans yet' : "Tonight's a blank canvas"}
          </h3>
          <p className="text-muted-foreground text-sm max-w-[280px] leading-relaxed">
            {weekendFilter 
              ? 'Be the first to share what you\'re up to this weekend!'
              : 'Share a plan and see who\'s down to join.'
            }
          </p>
        </div>
      ) : (
         feedItems.map(item => 
           item.type === 'plan' ? (
             <PlanItem
               key={`plan-${item.data.id}`}
               plan={item.data}
               currentUserId={userId}
               userVote={userVotes[item.data.id] || null}
               onVoteChange={fetchPlans}
               onEdit={handleEditPlan}
               onDelete={handleDeletePlan}
             />
           ) : (
             <EventCard
               key={`event-${item.data.id}`}
               event={item.data}
               currentUserId={userId}
               friendsInterested={item.data.friendsInterested}
               onRsvpChange={handleEventRsvpChange}
             />
           )
         )
      )}

      <CreatePlanDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        userId={userId}
        onPlanCreated={handlePlanCreated}
      />

      {editingPlan && (
        <EditPlanDialog
          open={!!editingPlan}
          onOpenChange={(open) => !open && setEditingPlan(null)}
          plan={editingPlan}
          onPlanUpdated={handlePlanUpdated}
        />
      )}

      <CreateEventDialog
        open={showCreateEventDialog}
        onOpenChange={setShowCreateEventDialog}
        onEventCreated={() => {
          setShowCreateEventDialog(false);
          fetchEvents();
        }}
      />
    </div>
  );
}
