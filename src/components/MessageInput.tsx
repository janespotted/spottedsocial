import React, { useState, useRef, memo, useCallback } from 'react';
import { Camera, Send, Image } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  onImageUpload: (file: File) => void;
  isUploading: boolean;
}

export const MessageInput = memo(function MessageInput({ 
  onSendMessage, 
  onImageUpload,
  isUploading 
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  }, [message, onSendMessage]);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
    // Reset the input
    e.target.value = '';
  }, [onImageUpload]);

  return (
    <div className="sticky bottom-0 bg-[#1a0f2e]/95 backdrop-blur border-t border-[#a855f7]/20 p-4">
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleImageChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleImageChange}
        accept="image/*"
        className="hidden"
      />
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={isUploading}
              className="text-white/60 hover:text-white hover:bg-[#2d1b4e]"
            >
              <Camera className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#1a0f2e] border-[#a855f7]/40">
            <DropdownMenuItem 
              onClick={() => cameraInputRef.current?.click()}
              className="text-white hover:bg-[#2d1b4e] cursor-pointer"
            >
              <Camera className="mr-2 h-4 w-4" />
              Camera
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => galleryInputRef.current?.click()}
              className="text-white hover:bg-[#2d1b4e] cursor-pointer"
            >
              <Image className="mr-2 h-4 w-4" />
              Upload from camera roll
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message..."
          className="flex-1 bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full"
        />

        <Button
          type="submit"
          size="icon"
          disabled={!message.trim()}
          className="bg-[#a855f7] hover:bg-[#9333ea] text-white shadow-[0_0_10px_rgba(168,85,247,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
});
