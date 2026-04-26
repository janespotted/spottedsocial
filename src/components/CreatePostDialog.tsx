import { useState, useEffect } from 'react';
import { PostMediaPicker, type MediaType } from '@/components/PostMediaPicker';
import { PostCaptionScreen } from '@/components/PostCaptionScreen';

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FlowStep = 'media' | 'caption';

export function CreatePostDialog({ open, onOpenChange }: CreatePostDialogProps) {
  const [step, setStep] = useState<FlowStep>('media');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('image');

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('media');
        setMediaFile(null);
        setMediaPreview(null);
        setMediaType('image');
      }, 300);
    }
  }, [open]);

  if (!open) return null;

  const handleMediaSelect = (file: File, preview: string, type: MediaType) => {
    setMediaFile(file);
    setMediaPreview(preview);
    setMediaType(type);
    setStep('caption');
  };

  const handleBack = () => {
    setStep('media');
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType('image');
  };

  const handleSuccess = () => {
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Step 1: Media Selection
  if (step === 'media') {
    return (
      <PostMediaPicker
        onClose={handleClose}
        onMediaSelect={handleMediaSelect}
      />
    );
  }

  // Step 2: Caption Screen
  if (step === 'caption' && mediaFile && mediaPreview) {
    return (
      <PostCaptionScreen
        imageFile={mediaFile}
        imagePreview={mediaPreview}
        mediaType={mediaType}
        onBack={handleBack}
        onSuccess={handleSuccess}
      />
    );
  }

  return null;
}
