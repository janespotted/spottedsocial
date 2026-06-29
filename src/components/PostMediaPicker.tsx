import { useRef, useEffect } from 'react';
import { Image } from 'lucide-react';
import { toast } from 'sonner';
import { isNativePlatform } from '@/lib/platform';
import { openSpottedCamera } from '@/lib/spotted-camera';
import { validateWebVideo } from '@/lib/video-picker-service';

export type MediaType = 'image' | 'video';

interface PostMediaPickerProps {
  onClose: () => void;
  onMediaSelect: (file: File, preview: string, mediaType: MediaType) => void;
}

export function PostMediaPicker({ onClose, onMediaSelect }: PostMediaPickerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isNativePlatform()) return;

    console.log('[PostMediaPicker] Opening native camera...');
    // Open native camera modal
    openSpottedCamera()
      .then((result) => {
        onMediaSelect(result.file, result.previewUrl, result.type === 'video' ? 'video' : 'image');
      })
      .catch((err) => {
        const msg = err?.message || String(err);
        console.log('[PostMediaPicker] Camera error:', msg);

        if (msg.includes('permission denied') || msg.includes('Permission denied')) {
          toast.error('Camera access required. Enable in Settings.', {
            action: {
              label: 'Open Settings',
              onClick: () => {
                import('@capacitor/app').then(({ App }) => App.openUrl({ url: 'app-settings:' })).catch(() => {});
              },
            },
          });
        } else if (!msg.includes('cancelled') && !msg.includes('canceled')) {
          // Unexpected error — show feedback
          toast.error('Camera failed to open. Try again.');
          console.error('[PostMediaPicker] Unexpected camera error:', err);
        }
        // User cancel or error — close
        onClose();
      });
  }, []);

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type.startsWith('video/')) {
      handleVideoFile(file);
    } else {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Max 10MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        onMediaSelect(file, reader.result as string, 'image');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoFile = async (file: File) => {
    try {
      const result = await validateWebVideo(file);
      onMediaSelect(result.file, result.previewUrl, 'video');
    } catch (err: any) {
      toast.error(err.message || 'Invalid video file');
    }
  };

  // On native, show nothing — the native camera modal is fullscreen
  if (isNativePlatform()) {
    return <div className="fixed inset-0 z-[100] bg-[#110a24]" />;
  }

  // Web fallback
  return (
    <div className="fixed inset-0 z-[100] bg-[#110a24] flex flex-col items-center justify-center pt-[env(safe-area-inset-top,0px)]">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleGallerySelect}
        className="hidden"
      />
      <button
        onClick={() => galleryRef.current?.click()}
        className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 transition-colors"
      >
        <Image className="h-6 w-6 text-white" />
        <span className="text-white font-medium">Choose from gallery</span>
      </button>
      <button onClick={onClose} className="mt-6 text-white/40 text-sm">Cancel</button>
    </div>
  );
}
