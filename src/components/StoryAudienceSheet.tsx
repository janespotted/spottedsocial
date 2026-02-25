import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Loader2, Heart, Users, Share2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type VisibilityOption = 'close_friends' | 'all_friends' | 'mutual_friends';

interface StoryAudienceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  visibility,
  onVisibilityChange,
  onPost,
  isPosting,
}: StoryAudienceSheetProps) {
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
          {/* Visibility Selector */}
          <div className="space-y-3 p-4 bg-[#1a0f2e]/50 rounded-xl border border-[#a855f7]/20">
            <p className="text-sm text-white/80 font-medium">Who can see this?</p>
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
