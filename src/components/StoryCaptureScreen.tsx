import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Zap, ZapOff, RefreshCw, Image as ImageIcon } from 'lucide-react';

interface StoryCaptureScreenProps {
  onCapture: (file: File) => void;
  onGallerySelect: (file: File) => void;
  onClose: () => void;
}

export function StoryCaptureScreen({ onCapture, onGallerySelect, onClose }: StoryCaptureScreenProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef<number>(0);

  const startCamera = useCallback(async () => {
    try {
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setHasCamera(true);
      setPermissionDenied(false);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      }
      setHasCamera(false);
    }
  }, [facingMode, stream]);

  useEffect(() => {
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Restart camera when facing mode changes
  useEffect(() => {
    if (hasCamera && !permissionDenied) {
      startCamera();
    }
  }, [facingMode]);

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

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;
    
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    // Set canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      }
      setIsCapturing(false);
    }, 'image/jpeg', 0.92);
  };

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

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
      
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
          onClick={handleClose}
          className="p-2 rounded-full bg-black/40 backdrop-blur-sm"
        >
          <X className="h-6 w-6 text-white" />
        </button>
        
        {hasCamera && !permissionDenied && (
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
        {hasCamera && !permissionDenied ? (
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
          <div className="flex flex-col items-center justify-center text-center p-8">
            <ImageIcon className="h-16 w-16 text-white/40 mb-4" />
            <p className="text-white/80 text-lg mb-2">
              {permissionDenied ? 'Camera access denied' : 'Camera not available'}
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
      {hasCamera && !permissionDenied && (
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
