import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';

interface WriteReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
  onReviewSubmitted: () => void;
}

export function WriteReviewDialog({
  open,
  onOpenChange,
  venueId,
  venueName,
  onReviewSubmitted
}: WriteReviewDialogProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('venue_reviews')
        .insert({
          venue_id: venueId,
          user_id: user.id,
          rating,
          review_text: reviewText.trim() || null,
          is_anonymous: isAnonymous
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('You have already reviewed this venue');
        } else {
          throw error;
        }
        return;
      }

      haptic.success();
      toast.success('Review submitted! 🎉');
      onReviewSubmitted();
      onOpenChange(false);
      
      // Reset form
      setRating(0);
      setReviewText('');
      setIsAnonymous(false);
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%] max-w-[400px] bg-[#1a0f2e]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-white text-center">
            Review {venueName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Star Rating */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-white/60">Tap to rate</p>
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setRating(i + 1)}
                  onMouseEnter={() => setHoverRating(i + 1)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      i < displayRating
                        ? 'text-[#d4ff00] fill-[#d4ff00]'
                        : 'text-white/20'
                    }`}
                  />
                </button>
              ))}
            </div>
            {displayRating > 0 && (
              <p className="text-sm text-[#d4ff00]">
                {displayRating === 1 && 'Poor'}
                {displayRating === 2 && 'Fair'}
                {displayRating === 3 && 'Good'}
                {displayRating === 4 && 'Great'}
                {displayRating === 5 && 'Amazing!'}
              </p>
            )}
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <Label className="text-white/70">Review (optional)</Label>
            <Textarea
              placeholder="Share your experience..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value.slice(0, 280))}
              className="bg-[#2d1b4e]/50 border-[#a855f7]/30 text-white placeholder:text-white/40 resize-none"
              rows={3}
            />
            <p className="text-xs text-white/40 text-right">{reviewText.length}/280</p>
          </div>

          {/* Anonymous Toggle */}
          <div className="flex items-center justify-between p-3 bg-[#2d1b4e]/50 rounded-xl border border-[#a855f7]/20">
            <div>
              <Label className="text-white">Post anonymously</Label>
              <p className="text-xs text-white/50">Your name won't be shown</p>
            </div>
            <Switch
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || isSubmitting}
            className="w-full bg-[#d4ff00] text-[#2d1b4e] hover:bg-[#d4ff00]/90 font-semibold"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
