import { useState } from 'react';
import { MessageCircle, ChevronUp, ChevronDown, MapPin, Users, Lock } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { format } from 'date-fns';

interface PlanItemProps {
  plan: {
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
  };
  currentUserId: string;
  userVote: 'up' | 'down' | null;
  onVoteChange: () => void;
}

export function PlanItem({ plan, currentUserId, userVote, onVoteChange }: PlanItemProps) {
  const [isVoting, setIsVoting] = useState(false);
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();

  const handleVote = async (voteType: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);

    try {
      if (userVote === voteType) {
        // Remove vote
        await supabase
          .from('plan_votes')
          .delete()
          .eq('plan_id', plan.id)
          .eq('user_id', currentUserId);
      } else if (userVote) {
        // Change vote
        await supabase
          .from('plan_votes')
          .update({ vote_type: voteType })
          .eq('plan_id', plan.id)
          .eq('user_id', currentUserId);
      } else {
        // New vote
        await supabase
          .from('plan_votes')
          .insert({
            plan_id: plan.id,
            user_id: currentUserId,
            vote_type: voteType
          });
      }
      onVoteChange();
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const handleUserClick = () => {
    if (plan.user) {
      openFriendCard({
        userId: plan.user.id,
        displayName: plan.user.display_name,
        avatarUrl: plan.user.avatar_url,
      });
    }
  };

  const handleVenueClick = () => {
    if (plan.venue_id) {
      openVenueCard(plan.venue_id);
    }
  };

  const visibilityLabel = plan.visibility === 'close_friends' ? 'Close Friends' : 'Friends';
  const visibilityIcon = plan.visibility === 'close_friends' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />;

  const planDate = new Date(plan.plan_date);
  const formattedDate = format(planDate, 'EEE, MMM d');
  const formattedTime = plan.plan_time.slice(0, 5);

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-2xl p-4 border border-border/30">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Avatar 
            className="h-10 w-10 cursor-pointer" 
            onClick={handleUserClick}
          >
            <AvatarImage src={plan.user?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {plan.user?.display_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p 
              className="font-semibold text-foreground cursor-pointer hover:underline"
              onClick={handleUserClick}
            >
              {plan.user?.display_name}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {visibilityIcon}
              <span>{visibilityLabel}</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p 
            className="text-sm font-medium text-[#d4ff00] cursor-pointer hover:underline flex items-center gap-1 justify-end"
            onClick={handleVenueClick}
          >
            <MapPin className="w-3 h-3" />
            {plan.venue_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formattedDate} • {formattedTime}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-foreground mb-4 whitespace-pre-wrap">
        {plan.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-muted-foreground gap-1 h-8 px-2"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{plan.comments_count}</span>
        </Button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${userVote === 'up' ? 'text-[#d4ff00]' : 'text-muted-foreground'}`}
            onClick={() => handleVote('up')}
            disabled={isVoting}
          >
            <ChevronUp className="w-5 h-5" />
          </Button>
          <span className={`text-sm font-medium min-w-[20px] text-center ${
            plan.score > 0 ? 'text-[#d4ff00]' : plan.score < 0 ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {plan.score}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${userVote === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}
            onClick={() => handleVote('down')}
            disabled={isVoting}
          >
            <ChevronDown className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
