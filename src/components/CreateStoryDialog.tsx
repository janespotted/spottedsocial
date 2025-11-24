import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateExpiryTime } from '@/lib/time-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateStoryDialog({ open, onOpenChange }: CreateStoryDialogProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);

  // Fetch current venue when dialog opens
  useEffect(() => {
    if (open && user) {
      fetchCurrentVenue();
    }
  }, [open, user]);

  const fetchCurrentVenue = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('venue_name, status')
      .eq('user_id', user?.id)
      .single();

    if (data && data.status === 'out' && data.venue_name) {
      setVenueName(data.venue_name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      toast.error('Please select an image or video file');
      return;
    }

    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const handleSubmit = async () => {
    if (!file || !user) return;

    setUploading(true);

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError, data } = await supabase.storage
        .from('post-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName);

      // Create story
      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          venue_name: venueName,
          expires_at: calculateExpiryTime(),
        });

      if (insertError) throw insertError;

      toast.success('Story posted!');
      onOpenChange(false);
      setFile(null);
      setPreview(null);
    } catch (error: any) {
      console.error('Error uploading story:', error);
      toast.error('Failed to post story');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/40 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create Story</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {preview ? (
            <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
              {file?.type.startsWith('image/') ? (
                <img src={preview} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <video src={preview} className="w-full h-full object-contain" controls />
              )}
            </div>
          ) : (
            <div className="aspect-[9/16] border-2 border-dashed border-[#a855f7]/40 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Upload className="h-12 w-12 text-[#a855f7] mx-auto mb-2" />
                <p className="text-white/60">Upload a photo or video</p>
              </div>
            </div>
          )}

          <Input
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="bg-[#0a0118] border-[#a855f7]/40 text-white"
          />

          <div className="flex gap-3">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 bg-transparent border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!file || uploading}
              className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                'Post Story'
              )}
            </Button>
          </div>

          <p className="text-white/60 text-xs text-center">
            Stories disappear at 5am
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
