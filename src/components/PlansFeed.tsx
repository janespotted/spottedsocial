import { useState, useEffect } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PlanItem } from './PlanItem';
import { CreatePlanDialog } from './CreatePlanDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoMode } from '@/hooks/useDemoMode';
import { FriendsPlanning } from './FriendsPlanning';

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

interface PlansFeedProps {
  userId: string;
}

export function PlansFeed({ userId }: PlansFeedProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);
  const demoEnabled = useDemoMode();

  const fetchPlanningFriends = async () => {
    if (!userId) return;
    
    try {
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
        .gte('expires_at', new Date().toISOString());

      if (!planningStatuses || planningStatuses.length === 0) {
        setPlanningFriends([]);
        return;
      }

      const planningUserIds = planningStatuses.map(s => s.user_id);
      
      // Get profiles for planning friends
      const { data: profiles } = await supabase
        .rpc('get_profiles_safe')
        .in('id', planningUserIds);

      if (profiles) {
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

  const fetchPlans = async () => {
    try {
      // Fetch plans that haven't expired
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('score', { ascending: false })
        .order('created_at', { ascending: false });

      if (plansError) throw plansError;

      if (!plansData || plansData.length === 0) {
        setPlans([]);
        setIsLoading(false);
        return;
      }

      // Fetch user profiles for plans
      const userIds = [...new Set(plansData.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .rpc('get_profiles_safe')
        .in('id', userIds);

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
  }, [userId, demoEnabled]);

  const handlePlanCreated = () => {
    setShowCreateDialog(false);
    fetchPlans();
  };

  if (isLoading) {
    return (
      <div className="space-y-5 px-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card/60 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-7 px-4 pb-24">
      {/* Friends Planning Section */}
      {planningFriends.length > 0 && (
        <FriendsPlanning friends={planningFriends} variant="card" />
      )}

      {/* Create Plan Button */}
      <button
        onClick={() => setShowCreateDialog(true)}
        className="w-full flex items-center justify-center gap-2 bg-white/[0.06] backdrop-blur-sm hover:bg-white/[0.10] text-white/80 hover:text-white py-3.5 rounded-xl transition-all duration-200 shadow-sm"
      >
        <Plus className="w-4 h-4" strokeWidth={1.5} />
        <span className="text-sm font-medium tracking-tight">Share a plan</span>
      </button>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mb-5">
            <Calendar className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">No plans yet</h3>
          <p className="text-muted-foreground text-sm max-w-[280px] leading-relaxed">
            Luckily, your posts deleted at 5am 😅<br/>
            Start making plans for your next night out!
          </p>
        </div>
      ) : (
        plans.map(plan => (
          <PlanItem
            key={plan.id}
            plan={plan}
            currentUserId={userId}
            userVote={userVotes[plan.id] || null}
            onVoteChange={fetchPlans}
          />
        ))
      )}

      <CreatePlanDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        userId={userId}
        onPlanCreated={handlePlanCreated}
      />
    </div>
  );
}
