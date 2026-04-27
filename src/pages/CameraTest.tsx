import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraPreview } from '@capgo/camera-preview';
import { ArrowLeft } from 'lucide-react';

export default function CameraTest() {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      CameraPreview.stop().catch(() => {});
    };
  }, []);

  const startCamera = async () => {
    try {
      await CameraPreview.start({
        position: 'rear',
        toBack: true,
        parent: 'cameraPreview',
        className: 'cameraPreview',
        disableAudio: false,
      });
      setStarted(true);
      console.log('[CameraTest] Camera started');
    } catch (err) {
      console.error('[CameraTest] Failed to start camera:', err);
    }
  };

  const handleCapture = async () => {
    try {
      const result = await CameraPreview.capture({ quality: 90 });
      console.log('[CameraTest] Capture result:', result);
      setLastCapture(result.value);
    } catch (err) {
      console.error('[CameraTest] Capture error:', err);
    }
  };

  const handleClose = async () => {
    await CameraPreview.stop().catch(() => {});
    navigate(-1);
  };

  return (
    <div className="fixed inset-0 z-[600]" style={{ backgroundColor: 'transparent' }}>
      {/* Camera preview renders behind this div via toBack: true */}
      <div id="cameraPreview" className="absolute inset-0" style={{ backgroundColor: 'transparent' }} />

      {/* Overlay UI */}
      <div className="relative z-10 flex flex-col h-full" style={{ backgroundColor: 'transparent' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
          <button onClick={handleClose} className="p-2 rounded-full bg-black/30 text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white/70 text-xs bg-black/30 px-3 py-1 rounded-full">
            {started ? 'Camera active' : 'Starting...'}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Capture preview (if taken) */}
        {lastCapture && (
          <div className="px-4 mb-4">
            <img
              src={`data:image/jpeg;base64,${lastCapture}`}
              alt="Capture"
              className="w-20 h-20 rounded-xl object-cover border-2 border-white/30"
            />
          </div>
        )}

        {/* Bottom controls */}
        <div className="flex items-center justify-center pb-[max(env(safe-area-inset-bottom),32px)]">
          <button
            onClick={handleCapture}
            className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center"
          >
            <div className="w-[60px] h-[60px] rounded-full bg-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
