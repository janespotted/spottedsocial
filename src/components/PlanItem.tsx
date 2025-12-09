import { useState, useEffect } from 'react';
import { MessageCircle, ChevronUp, ChevronDown, MapPin, Users, Lock, Send, UserPlus } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

const formatTimeTo12Hour = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}${minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : ''}${period}`;
};

interface DownUser {
  id: string;
  user_id: string;
  user?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface Participant {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

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

interface Comment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  user?: {
    display_name: string;
    avatar_url: string | null;
  };
}

export function PlanItem({ plan, currentUserId, userVote, onVoteChange }: PlanItemProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [downs, setDowns] = useState<DownUser[]>([]);
  const [isDown, setIsDown] = useState(false);
  const [isTogglingDown, setIsTogglingDown] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();

  // Fetch "I'm Down" reactions
  const fetchDowns = async () => {
    const { data } = await supabase
      .from('plan_downs')
      .select('id, user_id')
      .eq('plan_id', plan.id);

    if (data && data.length > 0) {
      const userIds = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      setDowns(data.map(d => ({
        ...d,
        user: profileMap.get(d.user_id) as { display_name: string; avatar_url: string | null } | undefined,
      })));
      setIsDown(data.some(d => d.user_id === currentUserId));
    } else {
      setDowns([]);
      setIsDown(false);
    }
  };

  // Fetch participants (friends going with the plan creator)
  const fetchParticipants = async () => {
    const { data } = await supabase
      .from('plan_participants')
      .select('id, user_id')
      .eq('plan_id', plan.id);

    if (data && data.length > 0) {
      const userIds = data.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      setParticipants(profiles?.map(p => ({
        id: p.id,
        user_id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url
      })) || []);
    } else {
      setParticipants([]);
    }
  };

  useEffect(() => {
    fetchDowns();
    fetchParticipants();
  }, [plan.id, currentUserId]);

  const handleToggleDown = async () => {
    if (isTogglingDown) return;
    setIsTogglingDown(true);

    try {
      if (isDown) {
        await supabase
          .from('plan_downs')
          .delete()
          .eq('plan_id', plan.id)
          .eq('user_id', currentUserId);
        setIsDown(false);
        setDowns(prev => prev.filter(d => d.user_id !== currentUserId));
      } else {
        await supabase
          .from('plan_downs')
          .insert({ plan_id: plan.id, user_id: currentUserId });
        setIsDown(true);
        toast.success("You're down! 🎉");
        
        // Send notification to plan creator (if not self)
        if (plan.user_id !== currentUserId) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', currentUserId)
            .single();
          
          const firstName = myProfile?.display_name?.split(' ')[0] || 'Someone';
          const message = `${firstName} is down for your plan at ${plan.venue_name}! 🎉`;
          
          await supabase.from('notifications').insert({
            sender_id: currentUserId,
            receiver_id: plan.user_id,
            type: 'plan_down',
            message: message,
          });
        }
        
        await fetchDowns();
      }
    } catch (error) {
      console.error('Error toggling down:', error);
    } finally {
      setIsTogglingDown(false);
    }
  };

  const fetchComments = async () => {
    setIsLoadingComments(true);
    const { data } = await supabase
      .from('plan_comments')
      .select('id, user_id, text, created_at')
      .eq('plan_id', plan.id)
      .order('created_at', { ascending: true });

    if (data) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      setComments(data.map(c => ({
        ...c,
        user: profileMap.get(c.user_id) as { display_name: string; avatar_url: string | null } | undefined,
      })));
    }
    setIsLoadingComments(false);
  };

  const handleToggleComments = async () => {
    if (!showComments && comments.length === 0) {
      await fetchComments();
    }
    setShowComments(!showComments);
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || isPostingComment) return;
    setIsPostingComment(true);

    const { error } = await supabase
      .from('plan_comments')
      .insert({
        plan_id: plan.id,
        user_id: currentUserId,
        text: newComment.trim(),
      });

    if (!error) {
      setNewComment('');
      await fetchComments();
      onVoteChange(); // Refresh to update comments_count
    }
    setIsPostingComment(false);
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

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
  const formattedTime = formatTimeTo12Hour(plan.plan_time);

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

      {/* Participants - Friends going with the plan creator */}
      {participants.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <UserPlus className="w-3 h-3" />
            Going with:
          </span>
          <div className="flex -space-x-2">
            {participants.slice(0, 5).map((participant) => (
              <Avatar 
                key={participant.id} 
                className="h-7 w-7 border-2 border-card cursor-pointer"
                onClick={() => openFriendCard({
                  userId: participant.user_id,
                  displayName: participant.display_name,
                  avatarUrl: participant.avatar_url,
                })}
              >
                <AvatarImage src={participant.avatar_url || ''} />
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  {participant.display_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ))}
            {participants.length > 5 && (
              <div className="h-7 w-7 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center">
                <span className="text-xs text-primary">+{participants.length - 5}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {plan.description && (
        <p className="text-foreground mb-3 whitespace-pre-wrap">
          {plan.description}
        </p>
      )}

      {/* I'm Down Section */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          size="sm"
          onClick={handleToggleDown}
          disabled={isTogglingDown}
          className={`rounded-full px-5 bg-[#a855f7] text-white shadow-[0_0_15px_rgba(168,85,247,0.6)] hover:bg-[#9333ea] ${isDown ? 'ring-2 ring-white/50' : ''}`}
        >
          I'm down! ✨
        </Button>
        
        {downs.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {downs.slice(0, 5).map((down) => (
                <Avatar 
                  key={down.id} 
                  className="h-7 w-7 border-2 border-card cursor-pointer"
                  onClick={() => down.user && openFriendCard({
                    userId: down.user_id,
                    displayName: down.user.display_name,
                    avatarUrl: down.user.avatar_url,
                  })}
                >
                  <AvatarImage src={down.user?.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {down.user?.display_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {downs.length === 1 
                ? `${downs[0].user?.display_name?.split(' ')[0]} is down`
                : `${downs.length} people are down`}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-muted-foreground gap-1 h-8 px-2"
          onClick={handleToggleComments}
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

      {/* Comments Section */}
      {showComments && (
        <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
          {isLoadingComments ? (
            <p className="text-muted-foreground text-sm text-center">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center">No comments yet</p>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarImage src={comment.user?.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      {comment.user?.display_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {comment.user?.display_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {getTimeAgo(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80">{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Comment Input */}
          <div className="flex gap-2 pt-2">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-background/50 border-border/30 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
            />
            <Button
              size="sm"
              onClick={handlePostComment}
              disabled={!newComment.trim() || isPostingComment}
              className="h-9 px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
