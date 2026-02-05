import { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';

export interface PhotoFilter {
  id: string;
  name: string;
  style: React.CSSProperties;
}

const FILTERS: PhotoFilter[] = [
  { id: 'none', name: 'Normal', style: {} },
  { id: 'vivid', name: 'Vivid', style: { filter: 'saturate(1.4) contrast(1.1)' } },
  { id: 'warm', name: 'Warm', style: { filter: 'sepia(0.25) saturate(1.2) brightness(1.05)' } },
  { id: 'cool', name: 'Cool', style: { filter: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)' } },
  { id: 'noir', name: 'Noir', style: { filter: 'grayscale(1) contrast(1.2) brightness(0.95)' } },
];

interface PhotoFilterScreenProps {
  imagePreview: string;
  onConfirm: (filteredFile: File, filteredPreview: string) => void;
  onCancel: () => void;
}

export function PhotoFilterScreen({ imagePreview, onConfirm, onCancel }: PhotoFilterScreenProps) {
  const [selectedFilter, setSelectedFilter] = useState<PhotoFilter>(FILTERS[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Load image dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (imageRef.current) {
        imageRef.current.src = imagePreview;
      }
    };
    img.src = imagePreview;
  }, [imagePreview]);

  const applyFilterToCanvas = async (): Promise<{ file: File; preview: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
          reject(new Error('Canvas not available'));
          return;
        }

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Apply CSS filter to canvas
        ctx.filter = selectedFilter.style.filter as string || 'none';
        ctx.drawImage(img, 0, 0);

        // Export as blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            
            const file = new File([blob], `filtered-${Date.now()}.jpg`, { type: 'image/jpeg' });
            const preview = canvas.toDataURL('image/jpeg', 0.92);
            resolve({ file, preview });
          },
          'image/jpeg',
          0.92
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imagePreview;
    });
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const { file, preview } = await applyFilterToCanvas();
      onConfirm(file, preview);
    } catch (error) {
      console.error('Error applying filter:', error);
      // Fallback: use original
      const response = await fetch(imagePreview);
      const blob = await response.blob();
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onConfirm(file, imagePreview);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col">
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 z-10">
        <button
          onClick={onCancel}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          disabled={isProcessing}
        >
          <X className="h-6 w-6 text-white" />
        </button>
        <span className="text-white font-semibold text-lg">Filters</span>
        <button
          onClick={handleConfirm}
          className="p-2 rounded-full bg-[#d4ff00] hover:bg-[#d4ff00]/90 transition-colors disabled:opacity-50"
          disabled={isProcessing}
        >
          <Check className="h-6 w-6 text-black" />
        </button>
      </div>

      {/* Image Preview with Filter */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <img
          ref={imageRef}
          src={imagePreview}
          alt="Preview"
          className="max-w-full max-h-full object-contain rounded-xl"
          style={selectedFilter.style}
        />
      </div>

      {/* Filter Strip */}
      <div className="pb-8 pt-4 px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter)}
              className="flex-shrink-0 flex flex-col items-center gap-2"
            >
              <div
                className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                  selectedFilter.id === filter.id
                    ? 'border-[#d4ff00] scale-105'
                    : 'border-white/20'
                }`}
              >
                <img
                  src={imagePreview}
                  alt={filter.name}
                  className="w-full h-full object-cover"
                  style={filter.style}
                />
              </div>
              <span
                className={`text-xs font-medium transition-colors ${
                  selectedFilter.id === filter.id ? 'text-[#d4ff00]' : 'text-white/60'
                }`}
              >
                {filter.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
