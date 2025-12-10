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

// Shorten neighborhood names for compact display
const shortenNeighborhood = (neighborhood: string | null | undefined): string | null => {
  if (!neighborhood) return null;
  
  const shortNames: Record<string, string> = {
    'West Hollywood': 'WeHo',
    'East Village': 'EV',
    'Lower East Side': 'LES',
    'West Village': 'WV',
    'Downtown LA': 'DTLA',
    'Silver Lake': 'SL',
    'Santa Monica': 'SM',
    'Beverly Hills': 'BH',
  };
  
  return shortNames[neighborhood] || neighborhood;
};

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

  if (friends.length === 0) return null;

  // Stacked avatar preview (max 4)
  const previewFriends = friends.slice(0, 4);
  const remainingCount = friends.length - previewFriends.length;

  if (variant === 'pill') {
    return (
      <div className={className} style={style}>
        {/* Expanded List */}
        {isExpanded && (
          <div className="mb-2 bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.3)] max-h-60 overflow-y-auto">
            {friends.map((friend) => (
              <div
                key={friend.user_id}
                className="flex items-center gap-3 p-3 border-b border-[#a855f7]/10 last:border-b-0"
              >
                {/* Animated avatar with pulsing ring */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-[#a855f7]/40 animate-pulse" style={{ transform: 'scale(1.15)' }} />
                  <Avatar className="w-9 h-9 flex-shrink-0 border-2 border-[#a855f7] relative z-10">
                    <AvatarImage
                      src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
                    />
                    <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                      {friend.display_name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/60 text-xs">Planning</span>
                    {friend.planning_neighborhood && (
                      <span className="text-xs bg-[#a855f7]/20 text-[#a855f7] px-1.5 py-0.5 rounded-full">
                        {shortenNeighborhood(friend.planning_neighborhood)}
                      </span>
                    )}
                  </div>
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
          className="bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-xl p-3 hover:bg-[#2d1b4e] hover:border-[#a855f7]/50 transition-all w-full group"
        >
          <div className="flex items-center gap-3">
            {/* Stacked avatars */}
            <div className="flex -space-x-2">
              {previewFriends.slice(0, 3).map((friend) => (
                <Avatar key={friend.user_id} className="w-7 h-7 border-2 border-[#2d1b4e] ring-1 ring-[#a855f7]/30">
                  <AvatarImage
                    src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
                  />
                  <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                    {friend.display_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-white/90 text-sm font-medium">
              {friends.length} still deciding
            </span>
            <div className="ml-auto transition-transform group-hover:scale-110">
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-[#a855f7]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#a855f7]" />
              )}
            </div>
          </div>
        </button>
      </div>
    );
  }

  // Card variant for Home page
  return (
    <div className={`bg-[#1a0f2e]/80 backdrop-blur border border-[#a855f7]/20 rounded-2xl p-4 shadow-[0_0_20px_rgba(168,85,247,0.15)] ${className}`}>
      {/* Header with stacked avatars */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤔</span>
          <h3 className="text-white font-semibold text-sm">Thinking About Going Out</h3>
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
          {/* Stacked avatar preview */}
          <div className="flex -space-x-2">
            {previewFriends.map((friend) => (
              <Avatar key={friend.user_id} className="w-6 h-6 border-2 border-[#1a0f2e] ring-1 ring-[#a855f7]/40">
                <AvatarImage
                  src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
                />
                <AvatarFallback className="bg-[#a855f7] text-white text-[10px]">
                  {friend.display_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          {remainingCount > 0 && (
            <span className="text-white/40 text-xs">+{remainingCount}</span>
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        {friends.slice(0, 3).map((friend) => (
          <div
            key={friend.user_id}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            {/* Animated avatar with pulsing ring */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#a855f7]/30 animate-pulse" style={{ transform: 'scale(1.2)' }} />
              <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7] relative z-10">
                <AvatarImage
                  src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
                />
                <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                  {friend.display_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-white/50 text-xs">Planning tonight</span>
                {friend.planning_neighborhood && (
                  <span className="text-xs bg-[#a855f7]/25 text-[#c084fc] px-2 py-0.5 rounded-full font-medium">
                    {shortenNeighborhood(friend.planning_neighborhood)}
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleReachOut(friend)}
              className="h-8 px-3 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full text-xs shadow-[0_0_10px_rgba(168,85,247,0.4)] hover:shadow-[0_0_15px_rgba(168,85,247,0.6)] transition-all"
            >
              Make plans
            </Button>
          </div>
        ))}
        
        {friends.length > 3 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center gap-1.5 text-[#a855f7] text-sm py-2 hover:text-[#c084fc] transition-colors group"
          >
            <span>{isExpanded ? 'Show less' : `+${friends.length - 3} more`}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
            ) : (
              <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
            )}
          </button>
        )}
        
        {isExpanded && friends.slice(3).map((friend) => (
          <div
            key={friend.user_id}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#a855f7]/30 animate-pulse" style={{ transform: 'scale(1.2)' }} />
              <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7] relative z-10">
                <AvatarImage
                  src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`}
                />
                <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                  {friend.display_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-white/50 text-xs">Planning tonight</span>
                {friend.planning_neighborhood && (
                  <span className="text-xs bg-[#a855f7]/25 text-[#c084fc] px-2 py-0.5 rounded-full font-medium">
                    {shortenNeighborhood(friend.planning_neighborhood)}
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleReachOut(friend)}
              className="h-8 px-3 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white rounded-full text-xs shadow-[0_0_10px_rgba(168,85,247,0.4)] hover:shadow-[0_0_15px_rgba(168,85,247,0.6)] transition-all"
            >
              Make plans
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
