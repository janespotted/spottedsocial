import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { X, Zap, ZapOff, RefreshCw, Image as ImageIcon } from 'lucide-react';

interface StoryCaptureScreenProps {
  onCapture: (file: File) => void;
  onGallerySelect: (file: File) => void;
  onClose: () => void;
}

export function StoryCaptureScreen({ onCapture, onGallerySelect, onClose }: StoryCaptureScreenProps) {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const webcamRef = useRef<Webcam>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef<number>(0);

  const videoConstraints = {
    facingMode: facingMode,
    aspectRatio: 9 / 16,
  };

  const handleFlipCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleFlipCamera();
    }
    lastTapRef.current = now;
  };

  const handleCapture = useCallback(() => {
    if (!webcamRef.current || isCapturing) return;
    
    setIsCapturing(true);

    const imageSrc = webcamRef.current.getScreenshot();
    
    if (imageSrc) {
      // Convert base64 to blob
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file);
        })
        .finally(() => setIsCapturing(false));
    } else {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture]);

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return;
    }

    onGallerySelect(file);
  };

  const handleUserMediaError = () => {
    setHasCamera(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Hidden gallery input */}
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*,video/*"
        onChange={handleGalleryChange}
        className="hidden"
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        <button 
          onClick={onClose}
          className="p-2 rounded-full bg-black/40 backdrop-blur-sm"
        >
          <X className="h-6 w-6 text-white" />
        </button>
        
        {hasCamera && (
          <button 
            onClick={() => setFlashEnabled(!flashEnabled)}
            className="p-2 rounded-full bg-black/40 backdrop-blur-sm"
          >
            {flashEnabled ? (
              <Zap className="h-6 w-6 text-[#d4ff00]" />
            ) : (
              <ZapOff className="h-6 w-6 text-white" />
            )}
          </button>
        )}
      </div>

      {/* Camera preview area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {hasCamera ? (
          <div 
            className="w-full h-full"
            onClick={handleDoubleTap}
          >
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              onUserMediaError={handleUserMediaError}
              mirrored={facingMode === 'user'}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover' 
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8">
            <ImageIcon className="h-16 w-16 text-white/40 mb-4" />
            <p className="text-white/80 text-lg mb-2">
              Camera not available
            </p>
            <p className="text-white/50 text-sm mb-6">
              Tap below to select from your gallery
            </p>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="px-6 py-3 bg-[#a855f7] text-white rounded-full font-medium"
            >
              Choose from Gallery
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {hasCamera && (
        <div 
          className="absolute bottom-0 left-0 right-0 z-20 pt-6 bg-gradient-to-t from-black/80 to-transparent"
          style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-around px-8">
            {/* Gallery button */}
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20"
            >
              <ImageIcon className="h-7 w-7 text-white" />
            </button>

            {/* Capture button */}
            <button
              onClick={handleCapture}
              disabled={isCapturing}
              className="relative"
            >
              <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center">
                <div className={`w-16 h-16 rounded-full bg-white transition-transform ${
                  isCapturing ? 'scale-90' : 'scale-100 active:scale-90'
                }`} />
              </div>
            </button>

            {/* Flip camera button */}
            <button
              onClick={handleFlipCamera}
              className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20"
            >
              <RefreshCw className="h-7 w-7 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
