import { useState, useEffect } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PlanItem } from './PlanItem';
import { CreatePlanDialog } from './CreatePlanDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoMode } from '@/hooks/useDemoMode';

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
  const demoEnabled = useDemoMode();

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
  }, [userId, demoEnabled]);

  const handlePlanCreated = () => {
    setShowCreateDialog(false);
    fetchPlans();
  };

  if (isLoading) {
    return (
      <div className="space-y-4 px-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card/50 rounded-2xl p-4 border border-border/30">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-24">
      {/* Create Plan Button */}
      <Button
        onClick={() => setShowCreateDialog(true)}
        className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
        variant="outline"
      >
        <Plus className="w-4 h-4 mr-2" />
        Share Your Plans
      </Button>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No plans yet</h3>
          <p className="text-muted-foreground text-sm max-w-[250px]">
            Be the first to share your weekend plans with friends!
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
