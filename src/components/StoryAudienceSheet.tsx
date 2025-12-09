import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type AudienceOption = 'friends' | 'buzz' | 'both';

interface StoryAudienceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueName: string | null;
  audience: AudienceOption;
  onAudienceChange: (value: AudienceOption) => void;
  isAnonymous: boolean;
  onAnonymousChange: (value: boolean) => void;
  onPost: () => void;
  isPosting: boolean;
}

export function StoryAudienceSheet({
  open,
  onOpenChange,
  venueName,
  audience,
  onAudienceChange,
  isAnonymous,
  onAnonymousChange,
  onPost,
  isPosting,
}: StoryAudienceSheetProps) {
  const showAudienceSelector = !!venueName;
  const showAnonymousToggle = showAudienceSelector && (audience === 'buzz' || audience === 'both');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-t border-[#a855f7]/40 rounded-t-3xl"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white text-xl">Share Story</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Audience Selector - only show when at a venue */}
          {showAudienceSelector ? (
            <div className="space-y-3 p-4 bg-[#1a0f2e]/50 rounded-xl border border-[#a855f7]/20">
              <p className="text-sm text-white/80 font-medium">Where should this go?</p>
              <RadioGroup
                value={audience}
                onValueChange={(value) => onAudienceChange(value as AudienceOption)}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="friends" id="friends-sheet" className="border-white/40 text-[#a855f7]" />
                  <Label htmlFor="friends-sheet" className="text-white/90 cursor-pointer">
                    Friends only
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="buzz" id="buzz-sheet" className="border-white/40 text-[#a855f7]" />
                  <Label htmlFor="buzz-sheet" className="text-white/90 cursor-pointer">
                    Tonight's Buzz at {venueName} only
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="both" id="both-sheet" className="border-white/40 text-[#a855f7]" />
                  <Label htmlFor="both-sheet" className="text-white/90 cursor-pointer">
                    Both
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ) : (
            <div className="p-4 bg-[#1a0f2e]/50 rounded-xl border border-[#a855f7]/20">
              <p className="text-white/80 text-sm">
                Your story will be visible to friends
              </p>
            </div>
          )}

          {/* Anonymous Toggle - only show when sharing to Tonight's Buzz */}
          {showAnonymousToggle && (
            <div className="flex items-center justify-between p-4 bg-[#1a0f2e]/50 rounded-xl border border-[#a855f7]/20">
              <Label htmlFor="anonymous-sheet" className="text-white/90">
                Post anonymously
                <span className="block text-xs text-white/50 mt-0.5">Only applies to Tonight's Buzz</span>
              </Label>
              <Switch
                id="anonymous-sheet"
                checked={isAnonymous}
                onCheckedChange={onAnonymousChange}
              />
            </div>
          )}

          <Button
            onClick={onPost}
            disabled={isPosting}
            className="w-full h-12 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white text-lg font-medium rounded-xl"
          >
            {isPosting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Posting...
              </>
            ) : (
              'Post Story'
            )}
          </Button>

          <p className="text-white/50 text-xs text-center">
            Stories disappear at 5am
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
