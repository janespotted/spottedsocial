import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, Image, RotateCcw } from 'lucide-react';

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
  const lastTapRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode, 
          width: { ideal: 1080 },
          height: { ideal: 1080 },
        },
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
  }, [facingMode]);

  // Restart camera when facingMode changes
  useEffect(() => {
    if (cameraActive) {
      startCamera();
    }
  }, [facingMode]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const flipCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      flipCamera();
    }
    lastTapRef.current = now;
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Mirror the image if using front camera
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
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
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
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
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="h-6 w-6 text-white" />
        </button>
        <span className="text-white font-semibold text-lg">New Post</span>
        <div className="w-10" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
        {cameraActive ? (
          <div 
            className="w-full h-full flex items-center justify-center"
            onClick={handleDoubleTap}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 px-6">
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
        <div 
          className="absolute bottom-0 left-0 right-0 z-20 pt-6 bg-gradient-to-t from-black/80 to-transparent"
          style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-around px-8">
            {/* Gallery */}
            <button
              onClick={openGallery}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Image className="h-6 w-6 text-white" />
            </button>

            {/* Capture Button */}
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full bg-white border-4 border-white/30 hover:scale-105 active:scale-95 transition-transform"
            />

            {/* Flip Camera */}
            <button
              onClick={flipCamera}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RotateCcw className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
