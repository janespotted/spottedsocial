import { useRef } from 'react';
import { X, Camera, Image } from 'lucide-react';
import { capturePhoto, pickFromGallery, isNativePlatform } from '@/lib/camera-service';
import { toast } from 'sonner';

interface PostMediaPickerProps {
  onClose: () => void;
  onMediaSelect: (file: File, preview: string) => void;
}

export function PostMediaPicker({ onClose, onMediaSelect }: PostMediaPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleNativeCapture = async () => {
    const result = await capturePhoto();
    if (result) {
      onMediaSelect(result.file, result.preview);
    } else {
      toast('Photo cancelled or permission denied');
    }
  };

  const handleNativeGallery = async () => {
    const result = await pickFromGallery();
    if (result) {
      const res = await fetch(result.preview);
      const blob = await res.blob();
      const file = new File([blob], `gallery-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onMediaSelect(file, result.preview);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideo = file.type.startsWith('video/');
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`File too large. Max ${isVideo ? '50' : '10'}MB.`);
        return;
      }
      if (isVideo) {
        const preview = URL.createObjectURL(file);
        onMediaSelect(file, preview);
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          onMediaSelect(file, reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
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

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col pt-[env(safe-area-inset-top,0px)]">
      {/* Hidden file inputs for web fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
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
