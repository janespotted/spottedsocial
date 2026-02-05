import { useRef, useState } from 'react';
import { X, Camera, Image } from 'lucide-react';
import { captureSelfie, pickFromGallery, isNativePlatform } from '@/lib/camera-service';
import { PhotoFilterScreen } from './PhotoFilterScreen';
import { toast } from 'sonner';

interface PostMediaPickerProps {
  onClose: () => void;
  onMediaSelect: (file: File, preview: string) => void;
}

export function PostMediaPicker({ onClose, onMediaSelect }: PostMediaPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  // Filter screen state
  const [showFilterScreen, setShowFilterScreen] = useState(false);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);

  const handleNativeCapture = async () => {
    const result = await captureSelfie();
    if (result) {
      // Show filter screen before proceeding
      setPendingImagePreview(result.preview);
      setShowFilterScreen(true);
    }
  };

  const handleNativeGallery = async () => {
    const result = await pickFromGallery();
    if (result) {
      // Show filter screen before proceeding
      setPendingImagePreview(result.preview);
      setShowFilterScreen(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Max 10MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingImagePreview(reader.result as string);
        setShowFilterScreen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFilterConfirm = (filteredFile: File, filteredPreview: string) => {
    setShowFilterScreen(false);
    setPendingImagePreview(null);
    onMediaSelect(filteredFile, filteredPreview);
  };

  const handleFilterCancel = () => {
    setShowFilterScreen(false);
    setPendingImagePreview(null);
  };

  const openGallery = () => {
    if (isNativePlatform()) {
      handleNativeGallery();
    } else {
      fileInputRef.current?.click();
    }
  };

  const openCamera = () => {
    if (isNativePlatform()) {
      handleNativeCapture();
    } else {
      cameraInputRef.current?.click();
    }
  };

  // Show filter screen if we have a pending image
  if (showFilterScreen && pendingImagePreview) {
    return (
      <PhotoFilterScreen
        imagePreview={pendingImagePreview}
        onConfirm={handleFilterConfirm}
        onCancel={handleFilterCancel}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Hidden file inputs for web fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between p-4 z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="h-6 w-6 text-white" />
        </button>
        <span className="text-white font-semibold text-lg">New Post</span>
        <div className="w-10" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-8 px-6">
          {/* Camera Option - Primary */}
          <button
            onClick={openCamera}
            className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#a855f7] to-[#d4ff00] flex items-center justify-center">
              <Camera className="h-10 w-10 text-black" />
            </div>
            <span className="text-white text-lg font-medium">Take a Photo</span>
          </button>

          {/* Gallery Option - Secondary */}
          <button
            onClick={openGallery}
            className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Image className="h-5 w-5 text-white" />
            <span className="text-white/80">Choose from Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
}
