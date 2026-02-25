import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateExpiryTime } from '@/lib/time-utils';
import { toast } from 'sonner';
import { StoryEditor } from './StoryEditor';
import { StoryCaptureScreen } from './StoryCaptureScreen';
import { StoryAudienceSheet } from './StoryAudienceSheet';

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type VisibilityOption = 'close_friends' | 'all_friends' | 'mutual_friends';
type FlowStep = 'capture' | 'edit' | 'audience';

export function CreateStoryDialog({ open, onOpenChange }: CreateStoryDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<FlowStep>('capture');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<VisibilityOption>('all_friends');
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (open && user) {
      fetchCurrentVenue();
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setStep('capture');
      setFile(null);
      setPreview(null);
      setVisibility('all_friends');
      setEditedBlob(null);
    }
  }, [open]);

  const fetchCurrentVenue = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('venue_name, venue_id, status')
      .eq('user_id', user?.id)
      .maybeSingle();

    if (data && data.status === 'out' && data.venue_name) {
      setVenueName(data.venue_name);
      setVenueId(data.venue_id);
    } else {
      setVenueName(null);
      setVenueId(null);
    }
  };

  const handleCapture = (capturedFile: File) => {
    setFile(capturedFile);
    setPreview(URL.createObjectURL(capturedFile));
    setEditedBlob(null);
    if (capturedFile.type.startsWith('image/')) {
      setStep('edit');
    } else {
      setStep('audience');
    }
  };

  const handleGallerySelect = (selectedFile: File) => {
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setEditedBlob(null);
    if (selectedFile.type.startsWith('image/')) {
      setStep('edit');
    } else {
      setStep('audience');
    }
  };

  const handleEditorSave = (blob: Blob) => {
    setEditedBlob(blob);
    setPreview(URL.createObjectURL(blob));
    setStep('audience');
  };

  const handleEditorCancel = () => {
    setStep('capture');
    setFile(null);
    setPreview(null);
    setEditedBlob(null);
  };

  const handleSubmit = async () => {
    if ((!file && !editedBlob) || !user) return;

    setUploading(true);

    try {
      const { data: venueData } = await supabase
        .from('night_statuses')
        .select('venue_name, venue_id, status')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentVenueName = venueData?.status === 'out' ? venueData.venue_name : null;
      const currentVenueId = venueData?.status === 'out' ? venueData.venue_id : null;

      const uploadFile = editedBlob || file!;
      const fileExt = editedBlob ? 'jpg' : file!.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName);

      const mediaType = editedBlob ? 'image' : (file!.type.startsWith('image/') ? 'image' : 'video');
      
      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          media_type: mediaType,
          venue_name: currentVenueName,
          venue_id: currentVenueId,
          is_public_buzz: false,
          is_anonymous: false,
          visibility,
          expires_at: calculateExpiryTime(),
        });

      if (insertError) throw insertError;

      toast.success('Story posted!');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error uploading story:', error);
      toast.error('Failed to post story');
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {step === 'capture' && (
        <StoryCaptureScreen
          onCapture={handleCapture}
          onGallerySelect={handleGallerySelect}
          onClose={() => onOpenChange(false)}
        />
      )}

      {step === 'edit' && preview && file && (
        <StoryEditor
          imageUrl={preview}
          isVideo={file.type.startsWith('video/')}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
        />
      )}

      <StoryAudienceSheet
        open={step === 'audience'}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            if (file?.type.startsWith('image/')) {
              setStep('edit');
            } else {
              setStep('capture');
            }
          }
        }}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        onPost={handleSubmit}
        isPosting={uploading}
      />

      {step === 'audience' && preview && (
        <div className="fixed inset-0 z-40 bg-black flex items-center justify-center">
          {file?.type.startsWith('video/') ? (
            <video 
              src={preview} 
              className="max-w-full max-h-full object-contain"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img 
              src={preview} 
              alt="Story preview" 
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      )}
    </>
  );
}
