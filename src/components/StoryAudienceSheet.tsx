import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Loader2, Heart, Users, Share2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type AudienceOption = 'friends' | 'buzz' | 'both';
type VisibilityOption = 'close_friends' | 'all_friends' | 'mutual_friends';

interface StoryAudienceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueName: string | null;
  audience: AudienceOption;
  onAudienceChange: (value: AudienceOption) => void;
  isAnonymous: boolean;
  onAnonymousChange: (value: boolean) => void;
  visibility: VisibilityOption;
  onVisibilityChange: (value: VisibilityOption) => void;
  onPost: () => void;
  isPosting: boolean;
}

const visibilityOptions: { value: VisibilityOption; label: string; description: string; icon: typeof Heart }[] = [
  { value: 'close_friends', label: 'Close Friends', description: 'Your inner circle', icon: Heart },
  { value: 'all_friends', label: 'All Friends', description: 'Everyone you are friends with', icon: Users },
  { value: 'mutual_friends', label: 'Mutual Friends', description: 'Friends + their friends', icon: Share2 },
];

export function StoryAudienceSheet({
  open,
  onOpenChange,
  venueName,
  audience,
  onAudienceChange,
  isAnonymous,
  onAnonymousChange,
  visibility,
  onVisibilityChange,
  onPost,
  isPosting,
}: StoryAudienceSheetProps) {
  const showAudienceSelector = !!venueName;
  const showAnonymousToggle = showAudienceSelector && (audience === 'buzz' || audience === 'both');
  const showVisibilitySelector = !showAudienceSelector || audience === 'friends' || audience === 'both';

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
          {showAudienceSelector && (
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
          )}

          {/* Visibility Selector - show when sharing to friends */}
          {showVisibilitySelector && (
            <div className="space-y-3 p-4 bg-[#1a0f2e]/50 rounded-xl border border-[#a855f7]/20">
              <p className="text-sm text-white/80 font-medium">
                {showAudienceSelector ? 'Who can see among friends?' : 'Who can see this?'}
              </p>
              <div className="space-y-2">
                {visibilityOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = visibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onVisibilityChange(option.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-[#a855f7]/30 border border-[#a855f7]'
                          : 'bg-[#1a0f2e]/30 border border-transparent hover:border-[#a855f7]/40'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${isSelected ? 'bg-[#a855f7]' : 'bg-white/10'}`}>
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-white/60'}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-white/80'}`}>
                          {option.label}
                        </p>
                        <p className="text-xs text-white/50">{option.description}</p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-[#a855f7] flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
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
