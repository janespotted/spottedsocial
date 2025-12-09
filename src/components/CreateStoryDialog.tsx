import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateExpiryTime } from '@/lib/time-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Loader2, Camera, Image, Pencil } from 'lucide-react';
import { StoryEditor } from './StoryEditor';

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AudienceOption = 'friends' | 'buzz' | 'both';

export function CreateStoryDialog({ open, onOpenChange }: CreateStoryDialogProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [audience, setAudience] = useState<AudienceOption>('friends');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Fetch current venue when dialog opens
  useEffect(() => {
    if (open && user) {
      fetchCurrentVenue();
    }
  }, [open, user]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setAudience('friends');
      setIsAnonymous(false);
      setShowEditor(false);
      setEditedBlob(null);
    }
  }, [open]);

  const fetchCurrentVenue = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('venue_name, venue_id, status')
      .eq('user_id', user?.id)
      .maybeSingle();

    if (data && data.status === 'out' && data.venue_name) {
      setVenueName(data.venue_name);
      setVenueId(data.venue_id);
    } else {
      setVenueName(null);
      setVenueId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      toast.error('Please select an image or video file');
      return;
    }

    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setEditedBlob(null);
    
    // Open editor for images
    if (selectedFile.type.startsWith('image/')) {
      setShowEditor(true);
    }
  };

  const handleEditorSave = (blob: Blob) => {
    setEditedBlob(blob);
    setShowEditor(false);
    // Update preview with edited image
    setPreview(URL.createObjectURL(blob));
  };

  const handleEditorCancel = () => {
    setShowEditor(false);
  };

  const handleSubmit = async () => {
    if ((!file && !editedBlob) || !user) return;

    setUploading(true);

    try {
      // Re-fetch venue to ensure we have the latest check-in data
      const { data: venueData } = await supabase
        .from('night_statuses')
        .select('venue_name, venue_id, status')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentVenueName = venueData?.status === 'out' ? venueData.venue_name : null;
      const currentVenueId = venueData?.status === 'out' ? venueData.venue_id : null;

      // Use edited blob if available, otherwise use original file
      const uploadFile = editedBlob || file!;
      const fileExt = editedBlob ? 'jpg' : file!.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName);

      // Determine story settings based on audience
      const isPublicBuzz = audience === 'buzz' || audience === 'both';
      const mediaType = editedBlob ? 'image' : (file!.type.startsWith('image/') ? 'image' : 'video');
      
      // Create story with fresh venue data
      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          media_type: mediaType,
          venue_name: currentVenueName,
          venue_id: currentVenueId,
          is_public_buzz: isPublicBuzz,
          is_anonymous: isAnonymous && isPublicBuzz,
          expires_at: calculateExpiryTime(),
        });

      if (insertError) throw insertError;

      const successMessage = audience === 'buzz' 
        ? 'Shared to Tonight\'s Buzz!' 
        : audience === 'both'
        ? 'Posted to friends & Tonight\'s Buzz!'
        : 'Story posted!';
        
      toast.success(successMessage);
      onOpenChange(false);
      setFile(null);
      setPreview(null);
      setEditedBlob(null);
    } catch (error: any) {
      console.error('Error uploading story:', error);
      toast.error('Failed to post story');
    } finally {
      setUploading(false);
    }
  };

  const showAudienceSelector = venueName && venueId;
  const showAnonymousToggle = showAudienceSelector && (audience === 'buzz' || audience === 'both');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-[#a855f7]/40 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create Story</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*,video/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            type="file"
            ref={galleryInputRef}
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {preview ? (
            <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden max-h-[250px]">
              {file?.type.startsWith('image/') || editedBlob ? (
                <img src={preview} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <video src={preview} className="w-full h-full object-contain" controls />
              )}
              {/* Button overlays */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                {/* Edit button - only for images */}
                {(file?.type.startsWith('image/') || editedBlob) && (
                  <button 
                    onClick={() => setShowEditor(true)}
                    className="p-2 bg-[#a855f7]/80 border border-[#a855f7] rounded-full hover:bg-[#a855f7] transition-colors"
                  >
                    <Pencil className="h-5 w-5 text-white" />
                  </button>
                )}
                {/* Change photo button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 bg-[#1a0f2e]/80 border border-[#a855f7]/40 rounded-full hover:bg-[#2d1b4e] transition-colors">
                      <Camera className="h-5 w-5 text-white" />
                    </button>
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
              </div>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="aspect-[9/16] max-h-[200px] border-2 border-dashed border-[#a855f7]/40 rounded-lg flex items-center justify-center cursor-pointer hover:border-[#a855f7] hover:bg-[#a855f7]/5 transition-colors">
                  <div className="text-center">
                    <Camera className="h-12 w-12 text-[#a855f7] mx-auto mb-2" />
                    <p className="text-white/60">Tap to add photo or video</p>
                  </div>
                </div>
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
          )}

          {/* Audience Selector - only show when at a venue */}
          {showAudienceSelector && (
            <div className="space-y-3 p-3 bg-[#2d1b4e]/30 rounded-lg border border-[#a855f7]/20">
              <p className="text-sm text-white/80 font-medium">Where should this go?</p>
              <RadioGroup
                value={audience}
                onValueChange={(value) => setAudience(value as AudienceOption)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="friends" id="friends" className="border-white/40" />
                  <Label htmlFor="friends" className="text-white/80 cursor-pointer">
                    Friends only
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="buzz" id="buzz" className="border-white/40" />
                  <Label htmlFor="buzz" className="text-white/80 cursor-pointer">
                    Tonight's Buzz at {venueName} only
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="both" id="both" className="border-white/40" />
                  <Label htmlFor="both" className="text-white/80 cursor-pointer">
                    Both
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Anonymous Toggle - only show when sharing to Tonight's Buzz */}
          {showAnonymousToggle && (
            <div className="flex items-center justify-between p-3 bg-[#2d1b4e]/30 rounded-lg border border-[#a855f7]/20">
              <Label htmlFor="anonymous" className="text-white/80">
                Post anonymously
                <span className="block text-xs text-white/50">Only applies to Tonight's Buzz</span>
              </Label>
              <Switch
                id="anonymous"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 bg-transparent border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!file || uploading}
              className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                'Post Story'
              )}
            </Button>
          </div>

          <p className="text-white/60 text-xs text-center">
            Stories disappear at 5am
          </p>
        </div>
      </DialogContent>

      {/* Story Editor - full screen overlay */}
      {showEditor && preview && file && (
        <StoryEditor
          imageUrl={preview}
          isVideo={file.type.startsWith('video/')}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
        />
      )}
    </Dialog>
  );
}
