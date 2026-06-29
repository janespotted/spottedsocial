import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFriendsOutStatus } from '@/hooks/useFriendsOutStatus';

export function FriendsOutPill() {
  const { data, isLoading } = useFriendsOutStatus();
  const { openFriendCard } = useFriendIdCard();
  const [expanded, setExpanded] = useState(false);

  const outFriends = data?.outFriends || [];
  const tbdFriends = data?.planningFriends || [];

  if (isLoading || (outFriends.length === 0 && tbdFriends.length === 0)) return null;

  const parts: string[] = [];
  if (outFriends.length > 0) parts.push(`${outFriends.length} out`);
  if (tbdFriends.length > 0) parts.push(`${tbdFriends.length} TBD`);

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+8px)] left-4 z-30 flex flex-col items-start">
      {/* Expanded List */}
      {expanded && (
        <div className="mb-2 w-72 bg-[#1a0a2e]/95 backdrop-blur border border-white/10 rounded-2xl max-h-80 overflow-y-auto">
          {/* Out Friends */}
          {outFriends.map(friend => (
            <button
              key={friend.user_id}
              onClick={() => {
                openFriendCard({
                  userId: friend.user_id,
                  displayName: friend.display_name,
                  avatarUrl: friend.avatar_url,
                  venueName: friend.venue_name,
                });
                setExpanded(false);
              }}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
            >
              <Avatar className="w-9 h-9 flex-shrink-0">
                <AvatarImage src={friend.avatar_url || undefined} />
                <AvatarFallback className="bg-[#1a0a2e] text-white text-xs">
                  {friend.display_name[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                <p className="text-[#d4ff00] text-xs truncate">
                  {friend.venue_name ? `At ${friend.venue_name}` : 'Out'}
                </p>
              </div>
            </button>
          ))}

          {/* TBD Section */}
          {tbdFriends.length > 0 && outFriends.length > 0 && (
            <div className="px-3 py-1.5 bg-white/[0.03] border-y border-white/5">
              <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">
                TBD tonight · {tbdFriends.length}
              </p>
            </div>
          )}
          {tbdFriends.map(friend => (
            <button
              key={friend.user_id}
              onClick={() => {
                openFriendCard({
                  userId: friend.user_id,
                  displayName: friend.display_name,
                  avatarUrl: friend.avatar_url,
                });
                setExpanded(false);
              }}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
            >
              <Avatar className="w-9 h-9 flex-shrink-0">
                <AvatarImage src={friend.avatar_url || undefined} />
                <AvatarFallback className="bg-[#1a0a2e] text-white text-xs">
                  {friend.display_name[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                <p className="text-white/40 text-xs truncate">
                  TBD{friend.planning_neighborhood ? ` · ${friend.planning_neighborhood}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pill Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#1a0a2e]/90 backdrop-blur border border-white/10 hover:bg-[#1a0a2e] transition-colors"
      >
        <div className="w-2 h-2 rounded-full bg-[#d4ff00]" />
        <span className="text-white/80 text-xs font-medium">{parts.join(' · ')}</span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-white/40" />
        )}
      </button>
    </div>
  );
}
