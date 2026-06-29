import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { Button } from '@/components/ui/button';
import { MessageSquare, ChevronDown, ChevronUp, Plus, Users, MapPin, MoreHorizontal } from 'lucide-react';
import { useState, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CITY_NEIGHBORHOODS } from '@/lib/city-neighborhoods';

interface PlanningFriend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  planning_neighborhood?: string | null;
}

interface UserProfile {
  display_name: string;
  avatar_url: string | null;
}

interface FriendsPlanningProps {
  friends: PlanningFriend[];
  variant?: 'card' | 'pill';
  className?: string;
  style?: CSSProperties;
  isUserPlanning?: boolean;
  isUserOut?: boolean;
  onJoinPlanning?: () => void;
  onLeavePlanning?: () => void;
  showJoinOption?: boolean;
  // New props for user planning row
  userProfile?: UserProfile | null;
  userPlanningNeighborhood?: string | null;
  userPlanningVisibility?: string | null;
  onChangeNeighborhood?: (neighborhood: string) => void;
  onChangeVisibility?: (visibility: string) => void;
  onSwitchToOut?: () => void;
  city?: string;
}

// Helper to display user-friendly visibility labels
const getVisibilityLabel = (visibility: string | null | undefined): string => {
  if (!visibility) return '';
  const labels: Record<string, string> = {
    'close_friends': '💛 close friends',
    'all_friends': '👫 all friends',
    'mutual_friends': '🔗 mutual friends',
  };
  return labels[visibility] || visibility;
};

const VISIBILITY_CYCLE: ('close_friends' | 'all_friends' | 'mutual_friends')[] = [
  'close_friends', 'all_friends', 'mutual_friends',
];

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

export function FriendsPlanning({ 
  friends, 
  variant = 'card',
  className = '',
  style,
  isUserPlanning = false,
  isUserOut = false,
  onJoinPlanning,
  onLeavePlanning,
  showJoinOption = false,
  userProfile,
  userPlanningNeighborhood,
  userPlanningVisibility,
  onChangeNeighborhood,
  onChangeVisibility,
  onSwitchToOut,
  city = 'la'
}: FriendsPlanningProps) {
  const navigate = useNavigate();
  const { openFriendCard } = useFriendIdCard();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);

  const neighborhoods = CITY_NEIGHBORHOODS[city] || CITY_NEIGHBORHOODS['la'];

  const handleReachOut = (friend: PlanningFriend) => {
    navigate('/messages', {
      state: {
        preselectedUser: {
          id: friend.user_id,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url
        },
        source: 'planning'
      }
    });
  };

  // Show section if there are friends OR if we should show the join option
  if (friends.length === 0 && !showJoinOption) return null;

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
                      src={friend.avatar_url || undefined}
                    />
                    <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                      {friend.display_name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/60 text-xs">TBD</span>
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
                    src={friend.avatar_url || undefined}
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

  // Helper to render a friend row
  const handleOpenFriendCard = (friend: PlanningFriend) => {
    if (friend.user_id === 'self') return;
    openFriendCard({
      userId: friend.user_id,
      displayName: friend.display_name,
      avatarUrl: friend.avatar_url,
    });
  };

  const renderFriendRow = (friend: PlanningFriend, isUser = false) => (
    <div key={friend.user_id}>
      <div className="flex items-center gap-3 py-3">
        <button onClick={() => !isUser && handleOpenFriendCard(friend)} className={!isUser ? 'hover:opacity-80 transition-opacity' : ''}>
          <Avatar className="w-12 h-12 flex-shrink-0 border-2 border-[#a855f7]">
            <AvatarImage src={friend.avatar_url || undefined} />
            <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
              {friend.display_name?.[0] || '?'}
            </AvatarFallback>
          </Avatar>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => !isUser && handleOpenFriendCard(friend)}
              className={`text-white font-semibold text-[15px] truncate ${!isUser ? 'hover:text-[#d4ff00] transition-colors cursor-pointer' : ''}`}
            >
              {friend.display_name}
            </button>
            {isUser && <span className="text-[#d4ff00] text-xs font-medium">You</span>}
          </div>
          {isUser ? (
            <div className="flex items-center gap-2 mt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs border border-[#a855f7]/30 text-[#a855f7] px-2.5 py-1 rounded-full hover:bg-[#a855f7]/10 transition-colors">
                    <Users className="w-3 h-3" />
                    {getVisibilityLabel(userPlanningVisibility) || 'All friends'}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-60 overflow-y-auto bg-[#1a0f2e] border border-[#a855f7]/30 z-50" align="start">
                  {VISIBILITY_CYCLE.map((vis) => (
                    <DropdownMenuItem key={vis} onClick={() => onChangeVisibility?.(vis)} className="text-white hover:bg-[#a855f7]/20 cursor-pointer">
                      {getVisibilityLabel(vis)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs border border-[#a855f7]/30 text-[#a855f7] px-2.5 py-1 rounded-full hover:bg-[#a855f7]/10 transition-colors">
                    <MapPin className="w-3 h-3" />
                    {shortenNeighborhood(userPlanningNeighborhood) || 'Select area'}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-60 overflow-y-auto bg-[#1a0f2e] border border-[#a855f7]/30 z-50" align="start">
                  {neighborhoods.map((n) => (
                    <DropdownMenuItem key={n} onClick={() => onChangeNeighborhood?.(n)} className="text-white hover:bg-[#a855f7]/20 cursor-pointer">
                      {n}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-0.5 text-white/40 text-xs">
              <Users className="w-3 h-3" />
              <span>{getVisibilityLabel(friend.planning_neighborhood ? 'close_friends' : 'all_friends')}</span>
              {friend.planning_neighborhood && (
                <>
                  <span className="text-white/20">|</span>
                  <MapPin className="w-3 h-3" />
                  <span>{friend.planning_neighborhood}</span>
                </>
              )}
            </div>
          )}
        </div>
        {!isUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors flex-shrink-0">
                <MoreHorizontal className="w-4 h-4 text-white/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a0f2e] border border-[#a855f7]/30 z-50">
              <DropdownMenuItem onClick={() => handleReachOut(friend)} className="text-white hover:bg-[#a855f7]/20 cursor-pointer">
                <MessageSquare className="w-4 h-4 mr-2" />
                Message
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors flex-shrink-0">
                <MoreHorizontal className="w-4 h-4 text-white/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a0f2e] border border-[#a855f7]/30 z-50">
              <DropdownMenuItem onClick={() => onSwitchToOut?.()} className="text-white hover:bg-[#a855f7]/20 cursor-pointer">
                I'm out now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLeavePlanning?.()} className="text-red-400 hover:bg-red-500/20 cursor-pointer">
                Cancel plans
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="h-px bg-white/5" />
    </div>
  );

  // Card variant for Home page
  return (
    <div className={`bg-[#1a1030] border border-[#a855f7]/20 rounded-2xl p-5 ${className}`}>
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-white font-bold text-base">TBD tonight</h3>
        <p className="text-white/40 text-sm">Let friends know when and where.</p>
      </div>

      {/* User's own row first (when planning) */}
      {isUserPlanning && userProfile && renderFriendRow(
        { user_id: 'self', display_name: userProfile.display_name, avatar_url: userProfile.avatar_url, planning_neighborhood: userPlanningNeighborhood },
        true
      )}

      {/* Friend rows */}
      {friends.slice(0, isExpanded ? undefined : 3).map((friend) => renderFriendRow(friend))}

      {/* Empty state */}
      {friends.length === 0 && !isUserPlanning && (
        <p className="text-white/30 text-sm text-center py-4">No one yet. Be first.</p>
      )}

      {/* Show more */}
      {friends.length > 3 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-1.5 text-[#a855f7] text-sm py-2 hover:text-[#c084fc] transition-colors"
        >
          <span>{isExpanded ? 'Show less' : `+${friends.length - 3} more`}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}

      {/* Bottom status bar (when planning) */}
      {isUserPlanning && (
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#a855f7]" />
            <span className="text-white/40 text-sm">You're TBD for tonight</span>
          </div>
          <button
            onClick={() => onSwitchToOut?.()}
            className="text-[#a855f7] text-sm font-medium hover:text-[#c084fc] transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {/* Join CTA (when not planning) */}
      {showJoinOption && !isUserPlanning && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            onClick={onJoinPlanning}
            className="w-full h-10 bg-[#a855f7]/15 hover:bg-[#a855f7]/25 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 border border-[#a855f7]/40 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isUserOut ? 'Switch to TBD' : "I'm in"}
          </button>
        </div>
      )}

      {/* Edit Status Sheet */}
      <Sheet open={showEditSheet} onOpenChange={setShowEditSheet}>
        <SheetContent side="bottom" className="bg-[#1a0f2e] border-t border-[#a855f7]/30 rounded-t-3xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-white text-center">Switch Status</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 pb-6">
            <button onClick={() => { setShowEditSheet(false); onSwitchToOut?.(); }}
              className="w-full h-12 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all">
              I'm out
            </button>
            <button onClick={() => { setShowEditSheet(false); onLeavePlanning?.(); }}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium rounded-xl flex items-center justify-center border border-white/10 transition-all">
              No longer going out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
