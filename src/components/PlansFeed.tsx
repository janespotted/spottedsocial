import { useState, useEffect, memo } from 'react';
import { Calendar, Plus, MapPin } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createResilientChannel } from '@/lib/resilient-channel';
import { PlanItem } from './PlanItem';
import { CreatePlanDialog } from './CreatePlanDialog';
import { CreateEventDialog } from './CreateEventDialog';
import { EditPlanDialog } from './EditPlanDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '@/lib/haptics';
import { emitPlanningVisibilityChanged } from '@/lib/night-status';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { goPlanning, stopSharing } from '@/lib/night-status';
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
  plan_type: string | null;
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
 
interface PreselectedFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface PlansFeedProps {
  userId: string;
  weekendFilter?: boolean;
  onClearWeekendFilter?: () => void;
  preselectedFriend?: PreselectedFriend | null;
  onPreselectedFriendConsumed?: () => void;
}

export const PlansFeed = memo(function PlansFeed({ userId, weekendFilter = false, onClearWeekendFilter, preselectedFriend, onPreselectedFriendConsumed }: PlansFeedProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
   const [events, setEvents] = useState<EventWithFriends[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [dialogPreselectedFriend, setDialogPreselectedFriend] = useState<PreselectedFriend | null>(null);
  const [showCreateEventDialog, setShowCreateEventDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);
  const [friendsOut, setFriendsOut] = useState<{ user_id: string; display_name: string; avatar_url: string | null; venue_name: string }[]>([]);
  const [isUserPlanning, setIsUserPlanning] = useState(false);
  const [isUserOut, setIsUserOut] = useState(false);
  const [userProfile, setUserProfile] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const [userPlanningNeighborhood, setUserPlanningNeighborhood] = useState<string | null>(null);
  const [userPlanningVisibility, setUserPlanningVisibility] = useState<string | null>(null);
  const [aroundTonightExpanded, setAroundTonightExpanded] = useState(false);
  const demoEnabled = useDemoMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { sendMeetUpNotification } = useMeetUp();

  // Auto-open create plan dialog when preselectedFriend is provided
  useEffect(() => {
    if (preselectedFriend) {
      setDialogPreselectedFriend(preselectedFriend);
      setShowCreateDialog(true);
      onPreselectedFriendConsumed?.();
    }
  }, [preselectedFriend]);
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
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', userId)
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

      // Get friends who are planning OR out
      let statusQuery = supabase
        .from('night_statuses')
        .select('user_id, planning_neighborhood, status, venue_name, is_demo')
        .in('user_id', friendIds)
        .in('status', ['planning', 'out'])
        .gte('expires_at', new Date().toISOString());
      if (!demoEnabled) {
        statusQuery = statusQuery.eq('is_demo', false);
      }
      const { data: activeStatuses } = await statusQuery;

      if (!activeStatuses || activeStatuses.length === 0) {
        setPlanningFriends([]);
        setFriendsOut([]);
        return;
      }

      const activeUserIds = activeStatuses.map(s => s.user_id);

      // Get profiles using cache, with direct fallback
      const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
      let profiles = allProfiles.filter((p: any) => activeUserIds.includes(p.id));
      const missingIds = activeUserIds.filter(id => !profiles.some((p: any) => p.id === id));
      if (missingIds.length > 0) {
        const { data: fallback } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, is_demo')
          .in('id', missingIds);
        if (fallback) profiles = [...profiles, ...fallback];
      }

      // Filter out demo profiles when demo disabled
      if (!demoEnabled) {
        profiles = profiles.filter((p: any) => !p.is_demo);
      }

      const planningResults: typeof planningFriends = [];
      const outResults: typeof friendsOut = [];

      for (const s of activeStatuses) {
        const profile = profiles.find((p: any) => p.id === s.user_id);
        if (!profile) continue;

        if (s.status === 'planning') {
          planningResults.push({
            user_id: s.user_id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            planning_neighborhood: s.planning_neighborhood,
          });
        } else if (s.status === 'out' && s.venue_name) {
          outResults.push({
            user_id: s.user_id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            venue_name: s.venue_name,
          });
        }
      }

      setPlanningFriends(planningResults);
      setFriendsOut(outResults);
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
        let eventsQuery = supabase
          .from('events')
          .select('*')
          .gte('event_date', today)
          .gt('expires_at', new Date().toISOString())
          .eq('city', city)
          .order('event_date', { ascending: true });
        if (!demoEnabled) {
          eventsQuery = eventsQuery.eq('is_demo', false);
        }
        const { data: eventsData } = await eventsQuery;
 
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

  const handleChangeVisibility = async (visibility: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('night_statuses')
        .update({
          planning_visibility: visibility,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      haptic.light();
      setUserPlanningVisibility(visibility);
      emitPlanningVisibilityChanged(visibility);
    } catch (error) {
      console.error('Error changing visibility:', error);
      toast({
        title: "Something went wrong",
        description: "Couldn't update your audience. Try again.",
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
      await goPlanning(userId);

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
      await stopSharing(userId);

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

      // Fetch user profiles for plans using cache, with direct fallback for missing profiles
      const userIds = [...new Set(plansData.map(p => p.user_id))];
      const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
      let profiles = allProfiles.filter((p: any) => userIds.includes(p.id));

      const missingIds = userIds.filter(id => !profiles.some((p: any) => p.id === id));
      if (missingIds.length > 0) {
        const { data: fallback } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url, is_demo')
          .in('id', missingIds);
        if (fallback) profiles = [...profiles, ...fallback];
      }

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

  // Instant same-device status updates (realtime is unreliable for own writes)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setIsUserOut(detail.status === 'out');
      setIsUserPlanning(detail.status === 'planning');
      if (detail.status === 'planning') {
        setUserPlanningNeighborhood(detail.planningNeighborhood ?? null);
        setUserPlanningVisibility(detail.planningVisibility ?? null);
      }
      // Also re-fetch to get updated friend lists
      fetchPlanningFriends();
    };
    window.addEventListener('nightStatusChanged', handler);
    return () => window.removeEventListener('nightStatusChanged', handler);
  }, []);

  // Realtime subscription for plans, plan_downs, and night_statuses
  useEffect(() => {
    let plansTimer: ReturnType<typeof setTimeout>;
    let planningTimer: ReturnType<typeof setTimeout>;
    const debouncedFetchPlans = () => {
      clearTimeout(plansTimer);
      plansTimer = setTimeout(() => fetchPlans(), 1500);
    };
    const debouncedFetchPlanning = () => {
      clearTimeout(planningTimer);
      planningTimer = setTimeout(() => fetchPlanningFriends(), 500);
    };

    const cleanupChannel = createResilientChannel({
      name: 'plans-realtime',
      configure: (ch) => ch
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'plans' },
          debouncedFetchPlans
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'plan_downs' },
          debouncedFetchPlans
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'night_statuses' },
          debouncedFetchPlanning
        ),
      onReconnect: () => {
        debouncedFetchPlans();
        debouncedFetchPlanning();
      },
    });

    return () => {
      clearTimeout(plansTimer);
      clearTimeout(planningTimer);
      cleanupChannel();
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

  // Combined "Around Tonight" list: out friends first, then TBD
  const aroundTonight = [
    ...friendsOut.map(f => ({ ...f, type: 'out' as const })),
    ...planningFriends.map(f => ({ ...f, type: 'planning' as const, venue_name: f.planning_neighborhood || undefined })),
  ];
  const aroundTonightCount = aroundTonight.length;
  const AROUND_TONIGHT_COLLAPSE = 4;
  const visibleAroundTonight = aroundTonightExpanded ? aroundTonight : aroundTonight.slice(0, AROUND_TONIGHT_COLLAPSE);
  const hasContent = aroundTonightCount > 0 || feedItems.length > 0;

  return (
    <div className="space-y-6 px-4">
      {/* 1. QUIET STATUS CONTROL */}
      <div className="flex items-center gap-3">
        <span className="text-white/40 text-sm">You're</span>
        <div className="flex-1 flex items-center bg-white/[0.04] rounded-full p-1">
          <button
            onClick={() => { if (!isUserOut) handleSwitchToOut(); }}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${
              isUserOut ? 'bg-[#d4ff00] text-black' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Out
          </button>
          <button
            onClick={() => { if (!isUserPlanning) handleJoinPlanning(); }}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${
              isUserPlanning ? 'bg-[#d4ff00] text-black' : 'text-white/40 hover:text-white/60'
            }`}
          >
            TBD
          </button>
          <button
            onClick={() => { if (isUserPlanning || isUserOut) handleLeavePlanning(); }}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${
              !isUserPlanning && !isUserOut ? 'bg-[#d4ff00] text-black' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Staying In
          </button>
        </div>
      </div>

      {!hasContent ? (
        /* UNIFIED EMPTY STATE */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-5">
            <Calendar className="w-10 h-10 text-[#a855f7]/60" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Nobody's out yet</h3>
          <p className="text-white/40 text-sm max-w-[260px] leading-relaxed">
            Be the first — update your status or share a plan.
          </p>
        </div>
      ) : (
        <>
          {/* 2. AROUND TONIGHT — WEIGHTED CENTERPIECE */}
          {aroundTonightCount > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-white font-bold text-xl">
                  Around tonight <span className="text-white/40 font-normal">· {aroundTonightCount}</span>
                </h2>
                {aroundTonightCount > AROUND_TONIGHT_COLLAPSE && (
                  <button
                    onClick={() => setAroundTonightExpanded(!aroundTonightExpanded)}
                    className="text-white/40 text-sm hover:text-white/60 transition-colors"
                  >
                    {aroundTonightExpanded ? 'Show less' : 'See all'}
                  </button>
                )}
              </div>
              <p className="text-white/30 text-sm mb-4">Friends who are out or down to go</p>

              <div className="space-y-0 divide-y divide-white/[0.06]">
                {visibleAroundTonight.map((friend) => (
                  <div key={friend.user_id} className="flex items-center gap-3 py-3.5">
                    <Avatar className={`w-12 h-12 border-2 ${friend.type === 'out' ? 'border-[#d4ff00]/50' : 'border-[#a855f7]/50'}`}>
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className={`text-white text-sm font-semibold ${friend.type === 'out' ? 'bg-[#d4ff00]/20' : 'bg-[#a855f7]/20'}`}>
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-[15px] truncate">{friend.display_name}</p>
                      {friend.type === 'out' ? (
                        <p className="text-[#d4ff00] text-sm truncate">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#d4ff00] mr-1.5 align-middle" />
                          Out · {friend.venue_name}
                        </p>
                      ) : (
                        <p className="text-[#a855f7] text-sm truncate">
                          TBD · {(friend as any).planning_neighborhood || 'down for anything'}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => sendMeetUpNotification(friend.user_id, friend.display_name, friend.avatar_url)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
                        friend.type === 'out'
                          ? 'bg-[#d4ff00] text-black hover:bg-[#d4ff00]/80'
                          : 'border border-white/20 text-white hover:bg-white/5'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Meet up
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider between sections */}
          {aroundTonightCount > 0 && feedItems.length > 0 && (
            <div className="h-px bg-white/[0.08]" />
          )}

          {/* 3. PLANS SECTION */}
          <div>
            <h2 className="text-white font-bold text-xl mb-3">Plans</h2>

            {/* Share a plan — lightweight dashed row */}
            <button
              onClick={() => setShowCreateDialog(true)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-dashed border-white/15 hover:border-white/25 hover:bg-white/[0.02] transition-colors mb-4"
            >
              <div className="w-11 h-11 rounded-full bg-[#d4ff00]/10 flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5 text-[#d4ff00]" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-medium text-[15px]">Share a plan</p>
                <p className="text-white/30 text-xs mt-0.5">Post when & where — see who's down</p>
              </div>
            </button>

            {/* Plan + Event cards */}
            <div className="space-y-4">
              {feedItems.map(item =>
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
              )}
            </div>
          </div>
        </>
      )}

      <CreatePlanDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setDialogPreselectedFriend(null);
        }}
        userId={userId}
        onPlanCreated={handlePlanCreated}
        preselectedFriend={dialogPreselectedFriend}
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
});
