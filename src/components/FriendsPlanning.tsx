import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageCircle, ChevronDown, ChevronUp, Plus, Check, X, Pencil } from 'lucide-react';
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
  onSwitchToOut,
  city = 'la'
}: FriendsPlanningProps) {
  const navigate = useNavigate();
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
        }
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">👀</span>
          <h3 className="text-white font-semibold text-sm">Planning on Going Out</h3>
        </div>
        
        {/* Stacked avatar preview */}
        {friends.length > 0 && (
          <div className="flex items-center gap-2">
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
        )}
      </div>
      
      {/* Empty state when no friends */}
      {friends.length === 0 && !isUserPlanning && (
        <p className="text-white/40 text-xs text-center py-2">
          No one yet. Be first.
        </p>
      )}
      
      <div className="space-y-2">
        {/* User's own planning row - shown first when user is planning */}
        {isUserPlanning && userProfile && (
          <>
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5">
              {/* Animated avatar with pulsing ring */}
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[#a855f7]/30 animate-pulse" style={{ transform: 'scale(1.2)' }} />
                <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7] relative z-10">
                  <AvatarImage
                    src={userProfile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.display_name}`}
                  />
                  <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                    {userProfile.display_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{userProfile.display_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-white/50 text-xs">Planning tonight —</span>
                  {/* Interactive neighborhood dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-xs bg-[#a855f7]/25 text-[#c084fc] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 hover:bg-[#a855f7]/35 transition-colors">
                        {shortenNeighborhood(userPlanningNeighborhood) || 'Select area'}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      className="max-h-60 overflow-y-auto bg-[#1a0f2e] border border-[#a855f7]/30 z-50"
                      align="start"
                    >
                      {neighborhoods.map((neighborhood) => (
                        <DropdownMenuItem
                          key={neighborhood}
                          onClick={() => onChangeNeighborhood?.(neighborhood)}
                          className="text-white hover:bg-[#a855f7]/20 cursor-pointer"
                        >
                          {neighborhood}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            
            {/* "You're in planning mode — Edit" below user row */}
            <div className="flex items-center justify-center gap-2 py-1.5 flex-wrap">
              <div className="w-2 h-2 rounded-full bg-[#a855f7]" />
              <span className="text-white/50 text-xs">You're in planning mode</span>
              {userPlanningVisibility && (
                <>
                  <span className="text-white/30 text-xs">·</span>
                  <span className="text-white/60 text-xs">{getVisibilityLabel(userPlanningVisibility)}</span>
                </>
              )}
              <span className="text-white/30 text-xs">—</span>
              <button
                onClick={() => setShowEditSheet(true)}
                className="text-[#a855f7] text-xs font-medium hover:text-[#c084fc] transition-colors"
              >
                Edit
              </button>
            </div>
          </>
        )}

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
                <span className="text-white/50 text-xs">Thinking about going out</span>
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
                <span className="text-white/50 text-xs">Thinking about going out</span>
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
      
      {/* Bottom CTA - Join Planning (only when NOT already planning) */}
      {showJoinOption && !isUserPlanning && (
        <div className="mt-5 pt-4 border-t border-white/10">
          <button
            onClick={onJoinPlanning}
            className="w-full h-[38px] bg-[#a855f7]/15 hover:bg-[#a855f7]/25 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 border border-[#a855f7]/50 shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-all px-3"
          >
            <Plus className="w-4 h-4" />
            {isUserOut ? 'Back to Planning Mode' : "I'm in"}
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
            <button
              onClick={() => {
                setShowEditSheet(false);
                onSwitchToOut?.();
              }}
              className="w-full h-12 bg-[#a855f7] hover:bg-[#a855f7]/80 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all"
            >
              I'm out 🎉
            </button>
            <button
              onClick={() => {
                setShowEditSheet(false);
                onLeavePlanning?.();
              }}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium rounded-xl flex items-center justify-center border border-white/10 transition-all"
            >
              No longer going out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
