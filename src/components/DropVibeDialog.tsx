import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateExpiryTime } from '@/lib/time-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Camera, MessageCircle, Upload, ArrowLeft } from 'lucide-react';
import { haptic } from '@/lib/haptics';

interface DropVibeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
  onVibeSubmitted?: () => void;
}

type ViewMode = 'select' | 'clip' | 'vibe';

const EMOJI_OPTIONS = ['🔥', '💃', '🍸', '🎵', '✨'];

export function DropVibeDialog({ 
  open, 
  onOpenChange, 
  venueId, 
  venueName,
  onVibeSubmitted 
}: DropVibeDialogProps) {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('select');
  const [uploading, setUploading] = useState(false);
  
  // Clip state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clipAnonymous, setClipAnonymous] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Vibe state
  const [vibeText, setVibeText] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [vibeAnonymous, setVibeAnonymous] = useState(true);

  const resetState = () => {
    setViewMode('select');
    setFile(null);
    setPreview(null);
    setClipAnonymous(false);
    setVibeText('');
    setSelectedEmoji(null);
    setVibeAnonymous(true);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      toast.error('Please select an image or video file');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const handleSubmitClip = async () => {
    if (!file || !user) return;

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          venue_name: venueName,
          venue_id: venueId,
          is_public_buzz: true,
          is_anonymous: clipAnonymous,
          expires_at: calculateExpiryTime(),
        });

      if (insertError) throw insertError;

      haptic.success();
      toast.success('Clip shared to Tonight\'s Buzz! ✨');
      onVibeSubmitted?.();
      handleClose();
    } catch (error: any) {
      console.error('Error uploading clip:', error);
      toast.error('Failed to share clip');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitVibe = async () => {
    if (!vibeText.trim() || !user) return;

    setUploading(true);

    try {
      const { error } = await supabase
        .from('venue_buzz_messages')
        .insert({
          user_id: user.id,
          venue_id: venueId,
          venue_name: venueName,
          text: vibeText.trim(),
          emoji_vibe: selectedEmoji,
          is_anonymous: vibeAnonymous,
          expires_at: calculateExpiryTime(),
        });

      if (error) throw error;

      haptic.success();
      toast.success('Vibe dropped! ✨');
      onVibeSubmitted?.();
      handleClose();
    } catch (error: any) {
      console.error('Error posting vibe:', error);
      toast.error('Failed to drop vibe');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-[#a855f7]/40 text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {viewMode !== 'select' && (
              <button 
                onClick={() => setViewMode('select')}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <DialogTitle className="text-xl font-bold text-white">
              {viewMode === 'select' && `Drop a Vibe at ${venueName}`}
              {viewMode === 'clip' && 'Share a Clip'}
              {viewMode === 'vibe' && 'Quick Vibe'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Selection View */}
        {viewMode === 'select' && (
          <div className="space-y-4 py-4">
            <p className="text-white/60 text-sm text-center">Show what's happening tonight</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setViewMode('clip')}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#2d1b4e]/50 border-2 border-[#a855f7]/30 hover:border-[#a855f7] hover:bg-[#2d1b4e] transition-all"
              >
                <Camera className="w-10 h-10 text-[#a855f7] mb-2" />
                <span className="text-white font-medium">Share a Clip</span>
                <span className="text-white/50 text-xs mt-1">Photo or video</span>
              </button>
              <button
                onClick={() => setViewMode('vibe')}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#2d1b4e]/50 border-2 border-[#d4ff00]/30 hover:border-[#d4ff00] hover:bg-[#2d1b4e] transition-all"
              >
                <MessageCircle className="w-10 h-10 text-[#d4ff00] mb-2" />
                <span className="text-white font-medium">Quick Vibe</span>
                <span className="text-white/50 text-xs mt-1">Text message</span>
              </button>
            </div>
          </div>
        )}

        {/* Clip Upload View */}
        {viewMode === 'clip' && (
          <div className="space-y-4">
            {preview ? (
              <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden max-h-[300px]">
                {file?.type.startsWith('image/') ? (
                  <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                ) : (
                  <video src={preview} className="w-full h-full object-contain" controls />
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-video border-2 border-dashed border-[#a855f7]/40 rounded-lg flex flex-col items-center justify-center hover:border-[#a855f7] transition-colors"
              >
                <Upload className="h-10 w-10 text-[#a855f7] mb-2" />
                <p className="text-white/60">Tap to upload</p>
              </button>
            )}

            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {preview && (
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
                className="w-full bg-transparent border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
              >
                Choose Different File
              </Button>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="clip-anonymous" className="text-white/80">Post anonymously</Label>
              <Switch
                id="clip-anonymous"
                checked={clipAnonymous}
                onCheckedChange={setClipAnonymous}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 bg-transparent border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitClip}
                disabled={!file || uploading}
                className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  'Share Clip'
                )}
              </Button>
            </div>

            <p className="text-white/50 text-xs text-center">
              Expires at 5am ✨
            </p>
          </div>
        )}

        {/* Quick Vibe View */}
        {viewMode === 'vibe' && (
          <div className="space-y-4">
            <div>
              <p className="text-white/60 text-sm mb-2">How's the vibe? (optional)</p>
              <div className="flex gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setSelectedEmoji(selectedEmoji === emoji ? null : emoji)}
                    className={`p-3 rounded-xl text-2xl transition-all ${
                      selectedEmoji === emoji
                        ? 'bg-[#a855f7]/30 border-2 border-[#a855f7] scale-110'
                        : 'bg-[#2d1b4e]/50 border-2 border-transparent hover:bg-[#2d1b4e]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Textarea
                value={vibeText}
                onChange={(e) => setVibeText(e.target.value.slice(0, 140))}
                placeholder="What's the vibe like right now?"
                className="bg-[#0a0118] border-[#a855f7]/40 text-white placeholder:text-white/40 min-h-[100px] resize-none"
              />
              <span className="absolute bottom-2 right-2 text-xs text-white/40">
                {vibeText.length}/140
              </span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="vibe-anonymous" className="text-white/80">Post anonymously</Label>
              <Switch
                id="vibe-anonymous"
                checked={vibeAnonymous}
                onCheckedChange={setVibeAnonymous}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 bg-transparent border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitVibe}
                disabled={!vibeText.trim() || uploading}
                className="flex-1 bg-[#d4ff00] hover:bg-[#d4ff00]/80 text-[#2d1b4e] font-semibold"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  'Drop Vibe'
                )}
              </Button>
            </div>

            <p className="text-white/50 text-xs text-center">
              Expires at 5am ✨
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
