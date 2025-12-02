import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera } from 'lucide-react';

interface TextBuzzItem {
  type: 'text';
  id: string;
  text: string;
  emoji_vibe: string | null;
  is_anonymous: boolean;
  created_at: string;
  profile?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface MediaBuzzItem {
  type: 'media';
  id: string;
  media_url: string;
  media_type: string;
  is_anonymous: boolean;
  created_at: string;
  profile?: {
    display_name: string;
    avatar_url: string | null;
  };
}

type BuzzItemData = TextBuzzItem | MediaBuzzItem;

interface BuzzItemProps {
  item: BuzzItemData;
}

export function BuzzItem({ item }: BuzzItemProps) {
  const [imageError, setImageError] = useState(false);
  const timeAgo = formatDistanceToNowStrict(new Date(item.created_at), { addSuffix: false });
  const shortTime = timeAgo
    .replace(' seconds', 's')
    .replace(' second', 's')
    .replace(' minutes', 'm')
    .replace(' minute', 'm')
    .replace(' hours', 'h')
    .replace(' hour', 'h')
    .replace(' days', 'd')
    .replace(' day', 'd');

  const displayName = item.is_anonymous 
    ? 'Anonymous' 
    : item.profile?.display_name || 'Someone';

  if (item.type === 'text') {
    return (
      <div className="p-3 bg-[#2d1b4e]/30 rounded-lg border border-[#a855f7]/10">
        <div className="flex items-start gap-2">
          {item.emoji_vibe && (
            <span className="text-lg">{item.emoji_vibe}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm leading-relaxed">"{item.text}"</p>
            <p className="text-white/40 text-xs mt-1">
              {displayName} • {shortTime} ago
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Media item
  return (
    <div className="p-3 bg-[#2d1b4e]/30 rounded-lg border border-[#a855f7]/10">
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-[#2d1b4e]">
          {item.media_type === 'image' ? (
            imageError ? (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="h-6 w-6 text-white/40" />
              </div>
            ) : (
              <img 
                src={item.media_url} 
                alt="Buzz clip" 
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
                loading="lazy"
              />
            )
          ) : (
            <video 
              src={item.media_url} 
              className="w-full h-full object-cover"
              muted
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!item.is_anonymous && item.profile && (
              <Avatar className="w-5 h-5">
                <AvatarImage src={item.profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.profile.display_name}`} />
                <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                  {item.profile.display_name[0]}
                </AvatarFallback>
              </Avatar>
            )}
            <span className="text-white/80 text-sm">{displayName}</span>
          </div>
          <p className="text-white/40 text-xs mt-1">
            {shortTime} ago
          </p>
        </div>
      </div>
    </div>
  );
}
