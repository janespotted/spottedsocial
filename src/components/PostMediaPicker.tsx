import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { X, Camera, Image, RotateCcw } from 'lucide-react';

interface PostMediaPickerProps {
  onClose: () => void;
  onMediaSelect: (file: File, preview: string) => void;
}

export function PostMediaPicker({ onClose, onMediaSelect }: PostMediaPickerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef<number>(0);

  const videoConstraints = {
    facingMode: facingMode,
  };

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

  const capturePhoto = useCallback(() => {
    if (!webcamRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot();
    
    if (imageSrc) {
      // Convert base64 to blob
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setCameraActive(false);
          onMediaSelect(file, imageSrc);
        });
    }
  }, [onMediaSelect]);

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

  const startCamera = () => {
    setCameraActive(true);
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
        {cameraActive ? (
          <div 
            className="w-full h-full"
            onClick={handleDoubleTap}
          >
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              mirrored={facingMode === 'user'}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover' 
              }}
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
