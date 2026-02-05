import { useRef } from 'react';
import { X, Camera, Image as ImageIcon } from 'lucide-react';
import { capturePhoto, pickFromGallery, isNativePlatform } from '@/lib/camera-service';
import { toast } from 'sonner';

interface StoryCaptureScreenProps {
  onCapture: (file: File) => void;
  onGallerySelect: (file: File) => void;
  onClose: () => void;
}

export function StoryCaptureScreen({ onCapture, onGallerySelect, onClose }: StoryCaptureScreenProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleNativeCapture = async () => {
    const result = await capturePhoto();
    if (result) {
      onCapture(result.file);
    }
  };

  const handleNativeGallery = async () => {
    const result = await pickFromGallery();
    if (result) {
      onGallerySelect(result.file);
    }
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Please select an image or video');
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large. Max 50MB.');
      return;
    }

    onGallerySelect(file);
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large. Max 50MB.');
      return;
    }

    onCapture(file);
  };

  const openGallery = () => {
    if (isNativePlatform()) {
      handleNativeGallery();
    } else {
      galleryInputRef.current?.click();
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
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Hidden file inputs for web fallback */}
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*,video/*"
        onChange={handleGalleryChange}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
        className="hidden"
      />

      {/* Top bar */}
      <div className="flex items-center justify-between p-4 z-10">
        <button 
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="h-6 w-6 text-white" />
        </button>
        <span className="text-white font-semibold text-lg">New Story</span>
        <div className="w-10" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-8 px-6">
          {/* Camera Option - Primary for stories */}
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
            <ImageIcon className="h-5 w-5 text-white" />
            <span className="text-white/80">Choose from Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
}
