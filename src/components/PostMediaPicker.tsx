import { useRef, useState } from 'react';
import { X, Camera, Image, Video } from 'lucide-react';
import { toast } from 'sonner';
import { isNativePlatform } from '@/lib/platform';
import { pickVideoNative, validateWebVideo } from '@/lib/video-picker-service';

export type MediaType = 'image' | 'video';

interface PostMediaPickerProps {
  onClose: () => void;
  onMediaSelect: (file: File, preview: string, mediaType: MediaType) => void;
}

export function PostMediaPicker({ onClose, onMediaSelect }: PostMediaPickerProps) {
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Max 10MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onMediaSelect(file, reader.result as string, 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVideoSelect = async () => {
    if (isNativePlatform()) {
      setVideoLoading(true);
      try {
        const result = await pickVideoNative();
        onMediaSelect(result.file, result.previewUrl, 'video');
      } catch (err: any) {
        if (!err.message?.includes('canceled') && !err.message?.includes('cancelled')) {
          toast.error(err.message || 'Failed to select video');
        }
      } finally {
        setVideoLoading(false);
      }
    } else {
      videoInputRef.current?.click();
    }
  };

  const handleWebVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setVideoLoading(true);
    try {
      const result = await validateWebVideo(file);
      onMediaSelect(result.file, result.previewUrl, 'video');
    } catch (err: any) {
      toast.error(err.message || 'Invalid video file');
    } finally {
      setVideoLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col pt-[env(safe-area-inset-top,0px)]">
      {/* Take Photo — opens native camera in photo mode */}
      <input
        ref={photoCaptureRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
      {/* Gallery — opens photo library */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      {/* Video from gallery (web fallback) */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleWebVideoSelect}
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
        <div className="flex flex-col items-center gap-6 px-6">
          {/* Camera button */}
          <button
            onClick={() => photoCaptureRef.current?.click()}
            className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#a855f7] to-[#d4ff00] flex items-center justify-center">
              <Camera className="h-8 w-8 text-black" />
            </div>
            <span className="text-white font-medium">Take Photo</span>
          </button>

          {/* Gallery and Video buttons side by side */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => galleryRef.current?.click()}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Image className="h-5 w-5 text-white" />
              <span className="text-white/80">Photo</span>
            </button>

            <button
              onClick={handleVideoSelect}
              disabled={videoLoading}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <Video className="h-5 w-5 text-white" />
              <span className="text-white/80">
                {videoLoading ? 'Loading...' : 'Video'}
              </span>
            </button>
          </div>

          <p className="text-white/30 text-xs text-center">
            Videos: max 30 seconds, 50MB
          </p>
        </div>
      </div>
    </div>
  );
}
