import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

interface PlanningFriend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  planning_neighborhood?: string | null;
}

interface FriendsPlanningProps {
  friends: PlanningFriend[];
  variant?: 'card' | 'pill';
  className?: string;
  style?: CSSProperties;
}

export function FriendsPlanning({ friends, variant = 'card', className = '', style }: FriendsPlanningProps) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleReachOut = (friend: PlanningFriend) => {
    navigate('/messages', { 
      state: { 
        preselectedUser: {
          id: friend.user_id,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url
        }
      } 
    });
  };

  const getPlanningText = (friend: PlanningFriend) => {
    if (friend.planning_neighborhood) {
      return `Planning tonight (${friend.planning_neighborhood})`;
    }
    return 'Planning tonight';
  };

  if (friends.length === 0) return null;

  if (variant === 'pill') {
    return (
      <div className={className} style={style}>
        {/* Expanded List */}
        {isExpanded && (
          <div className="mb-2 bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg shadow-[0_0_30px_rgba(168,85,247,0.4)] max-h-60 overflow-y-auto">
            {friends.map((friend) => (
              <div
                key={friend.user_id}
                className="flex items-center gap-3 p-3 border-b border-[#a855f7]/10 last:border-b-0"
              >
                <Avatar className="w-9 h-9 flex-shrink-0 border-2 border-[#a855f7]/50">
                  <AvatarImage
                    src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
                  />
                  <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                    {friend.display_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                  <p className="text-[#a855f7] text-xs">🎯 {getPlanningText(friend)}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleReachOut(friend)}
                  className="h-8 px-3 bg-[#a855f7]/20 hover:bg-[#a855f7]/30 text-white border border-[#a855f7]/50 rounded-full text-xs"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                  Reach out
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Collapsed Pill */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 hover:bg-[#2d1b4e] transition-colors w-full"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <span className="text-white/80 text-sm">{friends.length} friend{friends.length !== 1 ? 's' : ''} deciding</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-white/60" />
            ) : (
              <ChevronDown className="w-4 h-4 text-white/60" />
            )}
          </div>
        </button>
      </div>
    );
  }

  // Card variant for Home page
  return (
    <div className={`glass-card rounded-2xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-white font-semibold text-sm">Friends Planning</h3>
        <span className="text-white/50 text-xs ml-auto">{friends.length} deciding</span>
      </div>
      
      <div className="space-y-2">
        {friends.slice(0, 3).map((friend) => (
          <div
            key={friend.user_id}
            className="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50">
              <AvatarImage
                src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
              />
              <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                {friend.display_name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
              <p className="text-[#a855f7] text-xs">🎯 {getPlanningText(friend)}</p>
            </div>
            <Button
              size="sm"
              onClick={() => handleReachOut(friend)}
              className="h-8 px-3 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full text-xs shadow-[0_0_10px_rgba(168,85,247,0.4)]"
            >
              Make plans
            </Button>
          </div>
        ))}
        
        {friends.length > 3 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-center text-[#a855f7] text-sm py-2 hover:text-[#a855f7]/80 transition-colors"
          >
            {isExpanded ? 'Show less' : `+${friends.length - 3} more`}
          </button>
        )}
        
        {isExpanded && friends.slice(3).map((friend) => (
          <div
            key={friend.user_id}
            className="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50">
              <AvatarImage
                src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
              />
              <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                {friend.display_name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
              <p className="text-[#a855f7] text-xs">🎯 {getPlanningText(friend)}</p>
            </div>
            <Button
              size="sm"
              onClick={() => handleReachOut(friend)}
              className="h-8 px-3 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full text-xs shadow-[0_0_10px_rgba(168,85,247,0.4)]"
            >
              Make plans
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
