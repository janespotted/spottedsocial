import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronUp, ChevronDown, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { haptic } from '@/lib/haptics';
import { formatDistanceToNow } from 'date-fns';

interface ReviewCardProps {
  review: {
    id: string;
    user_id: string;
    rating: number;
    review_text: string | null;
    is_anonymous: boolean;
    score: number;
    created_at: string;
    image_url?: string | null;
    profile?: {
      display_name: string;
      avatar_url: string | null;
    };
  };
  currentUserVote?: 'up' | 'down' | null;
  onVoteChange: () => void;
}

export function ReviewCard({ review, currentUserVote, onVoteChange }: ReviewCardProps) {
  const { user } = useAuth();
  const [isVoting, setIsVoting] = useState(false);
  const [localScore, setLocalScore] = useState(review.score);
  const [localVote, setLocalVote] = useState<'up' | 'down' | null>(currentUserVote || null);

  const handleVote = async (voteType: 'up' | 'down') => {
    if (!user || isVoting) return;
    setIsVoting(true);

    try {
      if (localVote === voteType) {
        // Remove vote
        await supabase
          .from('review_votes')
          .delete()
          .eq('review_id', review.id)
          .eq('user_id', user.id);

        setLocalScore(prev => voteType === 'up' ? prev - 1 : prev + 1);
        setLocalVote(null);

        // Update review score
        await supabase
          .from('venue_reviews')
          .update({ score: localScore + (voteType === 'up' ? -1 : 1) })
          .eq('id', review.id);
      } else {
        // Upsert vote
        const scoreChange = localVote ? (voteType === 'up' ? 2 : -2) : (voteType === 'up' ? 1 : -1);
        
        await supabase
          .from('review_votes')
          .upsert({
            review_id: review.id,
            user_id: user.id,
            vote_type: voteType
          }, {
            onConflict: 'review_id,user_id'
          });

        setLocalScore(prev => prev + scoreChange);
        setLocalVote(voteType);

        // Update review score
        await supabase
          .from('venue_reviews')
          .update({ score: localScore + scoreChange })
          .eq('id', review.id);
      }

      haptic.light();
      onVoteChange();
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const displayName = review.is_anonymous 
    ? 'Anonymous' 
    : review.profile?.display_name || 'User';

  const avatarUrl = review.is_anonymous 
    ? null 
    : review.profile?.avatar_url;

  return (
    <div className="p-3 bg-[#2d1b4e]/50 rounded-xl border border-[#a855f7]/20">
      <div className="flex gap-3">
        {/* Vote buttons */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => handleVote('up')}
            disabled={isVoting || !user}
            className={`p-1 rounded transition-colors ${
              localVote === 'up' 
                ? 'text-[#d4ff00]' 
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <span className={`text-sm font-medium ${
            localScore > 0 ? 'text-[#d4ff00]' : localScore < 0 ? 'text-red-400' : 'text-white/60'
          }`}>
            {localScore}
          </span>
          <button
            onClick={() => handleVote('down')}
            disabled={isVoting || !user}
            className={`p-1 rounded transition-colors ${
              localVote === 'down' 
                ? 'text-red-400' 
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Review content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="w-6 h-6">
              {review.is_anonymous ? (
                <AvatarFallback className="bg-[#a855f7]/30 text-white text-xs">?</AvatarFallback>
              ) : (
                <>
                  <AvatarImage src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayName}`} />
                  <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                    {displayName[0]}
                  </AvatarFallback>
                </>
              )}
            </Avatar>
            <span className="text-sm font-medium text-white">{displayName}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${
                    i < review.rating ? 'text-[#d4ff00] fill-[#d4ff00]' : 'text-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
          {review.review_text && (
            <p className="text-sm text-white/70 leading-relaxed">{review.review_text}</p>
          )}
          {review.image_url && (
            <div className="mt-2 rounded-lg overflow-hidden">
              <img 
                src={review.image_url} 
                alt="Review photo"
                className="w-full h-32 object-cover"
              />
            </div>
          )}
          <p className="text-xs text-white/40 mt-1">
            {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
    </div>
  );
}
