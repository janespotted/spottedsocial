import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Type, Smile, Check, Trash2, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Overlay {
  id: string;
  type: 'text' | 'emoji';
  content: string;
  x: number;
  y: number;
  scale: number;
  color: string;
  fontSize: number;
}

interface StoryEditorProps {
  imageUrl: string;
  isVideo: boolean;
  onSave: (editedBlob: Blob) => void;
  onCancel: () => void;
}

const EMOJI_OPTIONS = ['🔥', '❤️', '😂', '🎉', '✨', '💀', '🥳', '😍', '🙌', '💯', '🤪', '🍾', '🥂', '💜', '⚡', '🌙'];
const COLOR_OPTIONS = ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#d4ff00', '#a855f7'];

export function StoryEditor({ imageUrl, isVideo, onSave, onCancel }: StoryEditorProps) {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [selectedColor, setSelectedColor] = useState('#FFFFFF');
  const [saving, setSaving] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; overlayStartX: number; overlayStartY: number } | null>(null);

  // Load image when component mounts
  useEffect(() => {
    if (!isVideo) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      img.onload = () => {
        imageRef.current = img;
      };
    }
  }, [imageUrl, isVideo]);

  const addTextOverlay = () => {
    if (!textInput.trim()) return;
    
    const newOverlay: Overlay = {
      id: Date.now().toString(),
      type: 'text',
      content: textInput,
      x: 50,
      y: 50,
      scale: 1,
      color: selectedColor,
      fontSize: 24,
    };
    
    setOverlays(prev => [...prev, newOverlay]);
    setTextInput('');
    setShowTextInput(false);
    setActiveOverlayId(newOverlay.id);
  };

  const addEmojiOverlay = (emoji: string) => {
    const newOverlay: Overlay = {
      id: Date.now().toString(),
      type: 'emoji',
      content: emoji,
      x: 50,
      y: 50,
      scale: 1,
      color: '#FFFFFF',
      fontSize: 48,
    };
    
    setOverlays(prev => [...prev, newOverlay]);
    setShowEmojiPicker(false);
    setActiveOverlayId(newOverlay.id);
  };

  const deleteOverlay = (id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
    setActiveOverlayId(null);
  };

  const handlePointerDown = (e: React.PointerEvent, overlayId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = overlays.find(o => o.id === overlayId);
    if (!overlay) return;
    
    setActiveOverlayId(overlayId);
    dragRef.current = {
      id: overlayId,
      startX: e.clientX,
      startY: e.clientY,
      overlayStartX: overlay.x,
      overlayStartY: overlay.y,
    };
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    
    e.preventDefault();
    const container = containerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragRef.current.startX) / container.width) * 100;
    const deltaY = ((e.clientY - dragRef.current.startY) / container.height) * 100;
    
    setOverlays(prev => prev.map(o => 
      o.id === dragRef.current!.id 
        ? { 
            ...o, 
            x: Math.max(0, Math.min(100, dragRef.current!.overlayStartX + deltaX)),
            y: Math.max(0, Math.min(100, dragRef.current!.overlayStartY + deltaY))
          }
        : o
    ));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleSave = useCallback(async () => {
    if (isVideo) {
      // For videos, we can't composite easily, so just return original
      // In a real app, you'd use ffmpeg or similar
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      onSave(blob);
      return;
    }

    setSaving(true);
    
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    if (!canvas || !img) {
      setSaving(false);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setSaving(false);
      return;
    }

    // Set canvas size to match image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw the base image
    ctx.drawImage(img, 0, 0);

    // Draw overlays
    for (const overlay of overlays) {
      const x = (overlay.x / 100) * canvas.width;
      const y = (overlay.y / 100) * canvas.height;
      
      if (overlay.type === 'text') {
        const fontSize = overlay.fontSize * (canvas.width / 400); // Scale based on canvas size
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = overlay.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add text shadow for visibility
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.fillText(overlay.content, x, y);
        ctx.shadowColor = 'transparent';
      } else if (overlay.type === 'emoji') {
        const fontSize = overlay.fontSize * (canvas.width / 400);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(overlay.content, x, y);
      }
    }

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (blob) {
        onSave(blob);
      }
      setSaving(false);
    }, 'image/jpeg', 0.9);
  }, [imageUrl, isVideo, overlays, onSave]);

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col pt-[env(safe-area-inset-top,0px)]">
      {/* Hidden canvas for compositing */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 z-20">
        <button onClick={onCancel} className="text-white p-2">
          <X className="h-6 w-6" />
        </button>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
          >
            {saving ? 'Saving...' : 'Done'}
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onClick={() => setActiveOverlayId(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Base media */}
        {isVideo ? (
          <video 
            src={imageUrl} 
            className="max-w-full max-h-full object-contain"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img 
            src={imageUrl} 
            alt="Story" 
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* Overlays */}
        {overlays.map(overlay => (
          <div
            key={overlay.id}
            className={`absolute cursor-move select-none ${
              activeOverlayId === overlay.id ? 'ring-2 ring-[#a855f7] ring-offset-2 ring-offset-black rounded' : ''
            }`}
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${overlay.fontSize}px`,
              color: overlay.color,
              textShadow: overlay.type === 'text' ? '2px 2px 4px rgba(0,0,0,0.5)' : 'none',
              fontWeight: overlay.type === 'text' ? 'bold' : 'normal',
              touchAction: 'none',
            }}
            onPointerDown={(e) => handlePointerDown(e, overlay.id)}
          >
            {overlay.content}
            
            {activeOverlayId === overlay.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteOverlay(overlay.id);
                }}
                className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-500 rounded-full p-1"
              >
                <Trash2 className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Text input modal */}
      {showTextInput && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-center justify-center p-4">
          <div className="bg-[#1a0f2e] rounded-xl p-4 w-full max-w-sm border border-[#a855f7]/40">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-semibold">Add Text</span>
              <button onClick={() => setShowTextInput(false)} className="text-white/60">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your text..."
              className="mb-3 bg-[#2d1b4e] border-[#a855f7]/40 text-white"
              autoFocus
            />
            
            {/* Color picker */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    selectedColor === color ? 'border-[#a855f7]' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            
            <Button
              onClick={addTextOverlay}
              disabled={!textInput.trim()}
              className="w-full bg-[#a855f7] hover:bg-[#a855f7]/80"
            >
              <Check className="h-4 w-4 mr-2" />
              Add Text
            </Button>
          </div>
        </div>
      )}

      {/* Emoji picker modal */}
      {showEmojiPicker && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-center justify-center p-4">
          <div className="bg-[#1a0f2e] rounded-xl p-4 w-full max-w-sm border border-[#a855f7]/40">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-semibold">Add Sticker</span>
              <button onClick={() => setShowEmojiPicker(false)} className="text-white/60">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              {EMOJI_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => addEmojiOverlay(emoji)}
                  className="text-3xl p-3 rounded-lg bg-[#2d1b4e] hover:bg-[#a855f7]/30 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="p-4 flex justify-center gap-4 z-20 bg-gradient-to-t from-black/80 to-transparent" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <button
          onClick={() => setShowTextInput(true)}
          className="flex flex-col items-center gap-1 p-3 rounded-lg bg-[#2d1b4e]/80 hover:bg-[#a855f7]/30 transition-colors"
        >
          <Type className="h-6 w-6 text-white" />
          <span className="text-xs text-white/70">Text</span>
        </button>
        <button
          onClick={() => setShowEmojiPicker(true)}
          className="flex flex-col items-center gap-1 p-3 rounded-lg bg-[#2d1b4e]/80 hover:bg-[#a855f7]/30 transition-colors"
        >
          <Smile className="h-6 w-6 text-white" />
          <span className="text-xs text-white/70">Sticker</span>
        </button>
        {overlays.length > 0 && (
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <Move className="h-4 w-4" />
            Drag to move
          </div>
        )}
      </div>
    </div>
  );
}
