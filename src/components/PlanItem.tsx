import { useState, useEffect } from 'react';
import { MessageCircle, ChevronUp, ChevronDown, MapPin, Users, Lock, Send, Clock, Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
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

const getSmartDateLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Tonight';
  if (isTomorrow(date)) return 'Tomorrow';
  const daysAway = differenceInDays(date, new Date());
  if (daysAway > 0 && daysAway <= 7) return `In ${daysAway} days`;
  return format(date, 'EEE, MMM d');
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
  onEdit?: (plan: PlanItemProps['plan']) => void;
  onDelete?: (planId: string) => void;
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

export function PlanItem({ plan, currentUserId, userVote, onVoteChange, onEdit, onDelete }: PlanItemProps) {
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  
  const isOwner = plan.user_id === currentUserId;

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
        triggerConfetti();
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
    haptic.light();

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
    haptic.light();

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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('plans')
        .delete()
        .eq('id', plan.id)
        .eq('user_id', currentUserId);
      
      if (error) throw error;
      
      toast.success('Plan deleted');
      haptic.light();
      onDelete?.(plan.id);
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error('Failed to delete plan');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const visibilityLabel = plan.visibility === 'close_friends' ? 'Close Friends' : 'Friends';
  const visibilityIcon = plan.visibility === 'close_friends' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />;

  const smartDateLabel = getSmartDateLabel(plan.plan_date);
  const formattedTime = formatTimeTo12Hour(plan.plan_time);
  const isCurrentUserDown = downs.some(d => d.user_id === currentUserId);

  // Get current user's profile for avatar in down pill
  const currentUserDown = downs.find(d => d.user_id === currentUserId);

  return (
    <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-4 transition-all duration-300">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <Avatar 
            className="h-10 w-10 cursor-pointer transition-all" 
            onClick={handleUserClick}
          >
            <AvatarImage src={plan.user?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {plan.user?.display_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p 
              className="font-bold text-foreground cursor-pointer hover:text-primary transition-colors text-base tracking-tight"
              onClick={handleUserClick}
            >
              {plan.user?.display_name}
            </p>
            <div className="flex items-center gap-1 text-xs text-white/60">
              {visibilityIcon}
              <span>{visibilityLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="text-right">
            <button 
              className="text-base font-bold text-[#d4ff00] hover:text-[#e8ff4d] cursor-pointer flex items-center gap-1.5 justify-end transition-colors whitespace-nowrap"
              onClick={handleVenueClick}
            >
              <MapPin className="w-3.5 h-3.5 text-white/50" />
              {plan.venue_name}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-white/70 mt-0.5 justify-end">
              <Calendar className="w-3 h-3 text-white/50" />
              <span className="font-semibold text-white">{smartDateLabel}</span>
              <Clock className="w-3 h-3 ml-0.5 text-white/50" />
              <span>{formattedTime}</span>
            </div>
          </div>
          
          {/* Owner actions dropdown */}
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background border-border">
                <DropdownMenuItem onClick={() => onEdit?.(plan)} className="gap-2 cursor-pointer">
                  <Pencil className="w-4 h-4" />
                  Edit Plan
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)} 
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Plan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Description */}
      {plan.description && (
        <p className="text-foreground text-sm mb-3 whitespace-pre-wrap leading-relaxed">
          {plan.description}
        </p>
      )}

      {/* Going With - Only show if participants exist */}
      {participants.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-white/40">Going with</span>
          <div className="flex -space-x-2">
            {participants.slice(0, 5).map((participant) => (
              <Avatar 
                key={participant.id} 
                className="h-6 w-6 border-2 border-background cursor-pointer hover:scale-110 transition-transform"
                onClick={() => openFriendCard({
                  userId: participant.user_id,
                  displayName: participant.display_name,
                  avatarUrl: participant.avatar_url,
                })}
              >
                <AvatarImage src={participant.avatar_url || ''} />
                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                  {participant.display_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ))}
            {participants.length > 5 && (
              <div className="h-6 w-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center">
                <span className="text-[10px] text-primary font-medium">+{participants.length - 5}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state - subtle text when no participants AND no downs */}
      {participants.length === 0 && downs.length === 0 && (
        <p className="text-xs text-muted-foreground/50 mb-3">
          Nobody's joined yet — be the first 👀
        </p>
      )}

      {/* Single "I'm Down" Pill */}
      <button
        onClick={handleToggleDown}
        disabled={isTogglingDown}
        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-300 mb-3 ${
          isDown 
            ? 'bg-[#bfe600] text-black hover:bg-[#b0d600] shadow-[0_0_8px_rgba(212,255,0,0.25)]' 
            : 'bg-primary/20 text-primary hover:bg-primary/30'
        }`}
      >
        <span>🎉</span>
        {isDown && currentUserDown?.user && (
          <Avatar className="h-5 w-5 border border-black/20">
            <AvatarImage src={currentUserDown.user.avatar_url || ''} />
            <AvatarFallback className="bg-black/20 text-black text-[8px]">
              {currentUserDown.user.display_name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        )}
        {downs.length > 1 && (
          <div className="flex -space-x-1.5 ml-0.5">
            {downs.filter(d => d.user_id !== currentUserId).slice(0, 3).map((down) => (
              <Avatar key={down.id} className="h-5 w-5 border border-black/20">
                <AvatarImage src={down.user?.avatar_url || ''} />
                <AvatarFallback className="bg-black/20 text-black text-[8px]">
                  {down.user?.display_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
        <span>
          {downs.length === 0 
            ? "I'm down!" 
            : isDown && downs.length === 1 
              ? "You're down!" 
              : `${downs.length} down`}
        </span>
      </button>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-muted-foreground gap-1.5 h-9 px-3 hover:bg-primary/10 hover:text-primary transition-colors opacity-60 hover:opacity-100"
          onClick={handleToggleComments}
        >
          <MessageCircle className="w-4 h-4" />
          <span>{plan.comments_count || 0}</span>
        </Button>

        <div className="flex items-center gap-0.5 bg-background/30 rounded-xl px-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-9 w-9 p-0 rounded-lg transition-all ${
              userVote === 'up' 
                ? 'text-[#d4ff00] bg-[#d4ff00]/10 opacity-100' 
                : 'text-muted-foreground hover:text-[#d4ff00] hover:bg-[#d4ff00]/10 opacity-60 hover:opacity-100'
            }`}
            onClick={() => handleVote('up')}
            disabled={isVoting}
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
          <span className={`text-sm font-bold min-w-[24px] text-center ${
            plan.score > 0 ? 'text-[#d4ff00]' : plan.score < 0 ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {plan.score}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-9 w-9 p-0 rounded-full transition-all ${
              userVote === 'down' 
                ? 'text-destructive bg-destructive/10 opacity-100' 
                : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-60 hover:opacity-100'
            }`}
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
            <p className="text-muted-foreground text-sm text-center py-2">No comments yet. Be the first!</p>
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
              className="flex-1 bg-background/50 border-border/30 text-sm focus:ring-primary/50"
              onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
            />
            <Button
              size="sm"
              onClick={handlePostComment}
              disabled={!newComment.trim() || isPostingComment}
              className="h-9 px-3 bg-primary hover:bg-primary/90"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your plan will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
