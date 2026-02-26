import { useState, useEffect } from 'react';
import { PostMediaPicker } from '@/components/PostMediaPicker';
import { PostCaptionScreen } from '@/components/PostCaptionScreen';

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FlowStep = 'media' | 'caption';

export function CreatePostDialog({ open, onOpenChange }: CreatePostDialogProps) {
  const [step, setStep] = useState<FlowStep>('media');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('media');
        setImageFile(null);
        setImagePreview(null);
        setMediaType('image');
      }, 300);
    }
  }, [open]);

  if (!open) return null;

  const handleMediaSelect = (file: File, preview: string) => {
    setImageFile(file);
    setImagePreview(preview);
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    setStep('caption');
  };

  const handleBack = () => {
    setStep('media');
    setImageFile(null);
    setImagePreview(null);
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
  if (step === 'caption' && imageFile && imagePreview) {
    return (
      <PostCaptionScreen
        imageFile={imageFile}
        imagePreview={imagePreview}
        mediaType={mediaType}
        onBack={handleBack}
        onSuccess={handleSuccess}
      />
    );
  }

  return null;
}
