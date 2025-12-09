import { useState, useRef, useEffect } from 'react';
import { X, Camera, Image, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PostMediaPickerProps {
  onClose: () => void;
  onMediaSelect: (file: File, preview: string) => void;
}

export function PostMediaPicker({ onClose, onMediaSelect }: PostMediaPickerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (error) {
      console.error('Camera access denied:', error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const flipCamera = async () => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    setTimeout(() => startCamera(), 100);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const preview = canvas.toDataURL('image/jpeg');
          stopCamera();
          onMediaSelect(file, preview);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        onMediaSelect(file, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openGallery = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {cameraActive ? (
          <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8">
            {/* Gallery Option - Primary */}
            <button
              onClick={openGallery}
              className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#a855f7] to-[#d4ff00] flex items-center justify-center">
                <Image className="h-10 w-10 text-black" />
              </div>
              <span className="text-white text-lg font-medium">Choose from Gallery</span>
            </button>

            {/* Camera Option - Secondary */}
            <button
              onClick={startCamera}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Camera className="h-5 w-5 text-white" />
              <span className="text-white/80">Take a Photo</span>
            </button>
          </div>
        )}
      </div>

      {/* Camera Controls */}
      {cameraActive && (
        <div className="flex items-center justify-center gap-8 p-8">
          {/* Flip Camera */}
          <button
            onClick={flipCamera}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <RotateCcw className="h-6 w-6 text-white" />
          </button>

          {/* Capture Button */}
          <button
            onClick={capturePhoto}
            className="w-20 h-20 rounded-full bg-white border-4 border-white/30 hover:scale-105 active:scale-95 transition-transform"
          />

          {/* Gallery */}
          <button
            onClick={openGallery}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Image className="h-6 w-6 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
