import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Star, Camera, X } from 'lucide-react';
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('File must be an image');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    const fileExt = imageFile.name.split('.').pop();
    const filePath = `reviews/${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filePath, imageFile);

    if (uploadError) {
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!user || rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload image if present
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage();
      }

      const { error } = await supabase
        .from('venue_reviews')
        .insert({
          venue_id: venueId,
          user_id: user.id,
          rating,
          review_text: reviewText.trim() || null,
          is_anonymous: isAnonymous,
          image_url: imageUrl
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
      setImageFile(null);
      setImagePreview(null);
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

          {/* Photo Upload */}
          <div className="space-y-2">
            <Label className="text-white/70">Photo (optional)</Label>
            {!imagePreview ? (
              <label 
                htmlFor="review-image" 
                className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-[#a855f7]/30 rounded-xl cursor-pointer hover:border-[#a855f7]/60 transition-colors bg-[#2d1b4e]/30"
              >
                <Camera className="w-5 h-5 text-white/60" />
                <span className="text-sm text-white/60">Add Photo</span>
                <input
                  id="review-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="relative rounded-xl overflow-hidden border-2 border-[#a855f7]/30">
                <img
                  src={imagePreview}
                  alt="Review preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                  type="button"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
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
