import { useEffect, useState } from 'react';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MessageCircle, MoreVertical, Flag, Ban, X as CloseIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/contexts/AuthContext';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { ReportDialog } from '@/components/ReportDialog';
import { toast } from 'sonner';
import { StoryViewer } from '@/components/StoryViewer';

interface FriendData {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  last_known_lat: number | null;
  last_known_lng: number | null;
}

interface NightStatus {
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
}

interface FriendsAtVenue {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface UserStatus {
  isOut: boolean;
  currentVenue: string | null;
  lastUpdatedAt: string | null;
  lastEndedAt: string | null;
  lat: number | null;
  lng: number | null;
  canSeeLocation: boolean;
}

export function FriendIdCard() {
  const { selectedFriend, closeFriendCard, openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const { sendMeetUpNotification } = useMeetUp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const demoEnabled = useDemoMode();
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendsAtVenue[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [statusSubtitle, setStatusSubtitle] = useState<string>('');
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [venueCoords, setVenueCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [hasStory, setHasStory] = useState(false);
  const [showStoryViewer, setShowStoryViewer] = useState(false);

  useEffect(() => {
    if (selectedFriend && user) {
      console.log('Friend ID Card opened for:', selectedFriend);
      // Check if this is a demo user
      checkIfDemoUser();
      // Check if friend has active stories
      checkForStories();
      // Fetch venue coordinates for distance calculation
      if (selectedFriend.venueName) {
        fetchVenueCoordinates(selectedFriend.venueName);
      }
      if (demoEnabled) {
        // In demo mode, use the provided venue directly
        setStatusSubtitle(selectedFriend.venueName || '');
        fetchUserLocation();
        fetchFriendsAtVenue();
      } else {
        // In production, fetch real status
        fetchUserStatus();
        fetchUserLocation();
      }
    } else {
      setFriendsAtVenue([]);
      setDistance(null);
      setUserStatus(null);
      setStatusSubtitle('');
      setIsDemoUser(false);
      setVenueCoords(null);
      setHasStory(false);
    }
  }, [selectedFriend, demoEnabled]);

  const checkForStories = async () => {
    if (!selectedFriend) return;
    const { data: stories } = await supabase
      .from('stories')
      .select('id')
      .eq('user_id', selectedFriend.userId)
      .gt('expires_at', new Date().toISOString())
      .limit(1);
    
    setHasStory(stories && stories.length > 0);
  };

  const handleViewStory = () => {
    if (hasStory && selectedFriend) {
      setShowStoryViewer(true); // Don't close card - let StoryViewer overlay on top
    }
  };

  const fetchVenueCoordinates = async (venueName: string) => {
    const { data } = await supabase
      .from('venues')
      .select('lat, lng')
      .eq('name', venueName)
      .maybeSingle();
    
    if (data?.lat && data?.lng) {
      setVenueCoords({ lat: data.lat, lng: data.lng });
    }
  };

  const checkIfDemoUser = async () => {
    if (!selectedFriend) return;
    // Use safe RPC to check if user is demo (respects location privacy)
    const { data } = await supabase.rpc('get_profile_safe', { target_user_id: selectedFriend.userId });
    setIsDemoUser(data?.[0]?.is_demo || false);
  };

  // Calculate distance when we have both locations
  useEffect(() => {
    // Get friend's coordinates from multiple sources (with fallback to venue coords)
    const friendLat = selectedFriend?.lat || userStatus?.lat || venueCoords?.lat;
    const friendLng = selectedFriend?.lng || userStatus?.lng || venueCoords?.lng;

    if (userLocation && friendLat && friendLng) {
      const dist = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        friendLat,
        friendLng
      );
      setDistance(dist);
    } else {
      setDistance(null);
    }
  }, [selectedFriend, userLocation, userStatus, venueCoords]);

  const fetchUserStatus = async () => {
    if (!selectedFriend || !user) return;

    try {
      // Check if viewer can see this user's location
      const { data: canSeeData } = await supabase.rpc('can_see_location', {
        viewer_id: user.id,
        target_user_id: selectedFriend.userId
      });

      const canSeeLocation = canSeeData || false;

      // Fetch the most recent active check-in (ended_at is null)
      const { data: activeCheckIn } = await supabase
        .from('checkins')
        .select('venue_name, lat, lng, last_updated_at')
        .eq('user_id', selectedFriend.userId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeCheckIn && canSeeLocation) {
        // User is currently out at a venue
        const lastUpdated = new Date(activeCheckIn.last_updated_at);
        const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
        
        setUserStatus({
          isOut: true,
          currentVenue: activeCheckIn.venue_name,
          lastUpdatedAt: activeCheckIn.last_updated_at,
          lastEndedAt: null,
          lat: activeCheckIn.lat,
          lng: activeCheckIn.lng,
          canSeeLocation: true
        });

        const timeAgo = minutesAgo < 1 ? 'just now' : 
                       minutesAgo < 60 ? `${minutesAgo} min ago` : 
                       `${Math.floor(minutesAgo / 60)} hr ago`;
        
        setStatusSubtitle(`@ ${activeCheckIn.venue_name} • ${timeAgo}`);
        
        // Fetch friends at this venue
        fetchFriendsAtVenue(activeCheckIn.venue_name);
      } else if (!canSeeLocation) {
        // Location sharing is OFF or viewer doesn't have permission
        setUserStatus({
          isOut: false,
          currentVenue: null,
          lastUpdatedAt: null,
          lastEndedAt: null,
          lat: null,
          lng: null,
          canSeeLocation: false
        });
        setStatusSubtitle('Location hidden');
      } else {
        // User is no longer out - fetch their last ended check-in
        const { data: lastCheckIn } = await supabase
          .from('checkins')
          .select('venue_name, ended_at')
          .eq('user_id', selectedFriend.userId)
          .not('ended_at', 'is', null)
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCheckIn && canSeeLocation) {
          const hoursAgo = Math.floor((Date.now() - new Date(lastCheckIn.ended_at).getTime()) / 3600000);
          
          setUserStatus({
            isOut: false,
            currentVenue: null,
            lastUpdatedAt: null,
            lastEndedAt: lastCheckIn.ended_at,
            lat: null,
            lng: null,
            canSeeLocation: true
          });

          const timeAgo = hoursAgo < 1 ? 'less than an hour ago' : 
                         hoursAgo === 1 ? '1 hour ago' : 
                         `${hoursAgo} hours ago`;
          
          setStatusSubtitle(`In for the night • Last at ${lastCheckIn.venue_name} ${timeAgo}`);
        } else {
          setUserStatus({
            isOut: false,
            currentVenue: null,
            lastUpdatedAt: null,
            lastEndedAt: null,
            lat: null,
            lng: null,
            canSeeLocation: true
          });
          setStatusSubtitle('In for the night');
        }
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
      setStatusSubtitle('Status unavailable');
    }
  };

  const fetchUserLocation = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('last_known_lat, last_known_lng')
      .eq('id', user.id)
      .single();

    if (data && data.last_known_lat && data.last_known_lng) {
      setUserLocation({ lat: data.last_known_lat, lng: data.last_known_lng });
    }
  };

  const fetchFriendsAtVenue = async (venueName?: string) => {
    const venue = venueName || selectedFriend?.venueName;
    if (!venue || !user) return;

    // Fetch other friends at the same venue (both directions)
    const { data: sentFriendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted');

    const { data: receivedFriendships } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('friend_id', user.id)
      .eq('status', 'accepted');

    const friendIds = [
      ...(sentFriendships?.map(f => f.friend_id) || []),
      ...(receivedFriendships?.map(f => f.user_id) || [])
    ];

    // Find active check-ins at this venue
    const { data: activeCheckIns } = await supabase
      .from('checkins')
      .select('user_id, profiles:user_id(display_name, avatar_url)')
      .eq('venue_name', venue)
      .neq('user_id', selectedFriend.userId)
      .in('user_id', friendIds)
      .is('ended_at', null);

    if (activeCheckIns) {
      const friends = activeCheckIns.map(c => ({
        user_id: c.user_id,
        display_name: (c.profiles as any)?.display_name || 'Friend',
        avatar_url: (c.profiles as any)?.avatar_url || null,
      }));
      setFriendsAtVenue(friends);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleOpenDM = () => {
    if (!selectedFriend) return;

    closeFriendCard();
    navigate('/messages', { 
      state: { 
        preselectedUser: {
          id: selectedFriend.userId,
          display_name: selectedFriend.displayName,
          avatar_url: selectedFriend.avatarUrl
        }
      } 
    });
  };

  const handleMeetUp = async () => {
    if (!selectedFriend) return;
    
    await sendMeetUpNotification(
      selectedFriend.userId,
      selectedFriend.displayName,
      selectedFriend.avatarUrl
    );
    closeFriendCard();
  };

  const handleVenueClick = async (venueName: string) => {
    closeFriendCard();
    
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();
      
    if (data?.id) {
      openVenueCard(data.id);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedFriend || !user) return;

    try {
      const { error } = await supabase
        .from('blocked_users')
        .insert({
          blocker_id: user.id,
          blocked_id: selectedFriend.userId,
        });

      if (error) {
        if (error.code === '23505') {
          toast.info('User already blocked');
        } else {
          throw error;
        }
      } else {
        toast.success(`Blocked ${selectedFriend.displayName}`);
      }
      closeFriendCard();
    } catch (error: any) {
      console.error('Error blocking user:', error);
      toast.error('Failed to block user');
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeDown: closeFriendCard,
    threshold: 50
  });

  return (
    <>
      {selectedFriend && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[300] bg-black/80 animate-in fade-in-0"
            onClick={closeFriendCard}
          />
      {/* Mobile frame constrained container */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-full z-[300] flex items-center justify-center px-4 pointer-events-none">
              {/* Card */}
              <div 
                className="relative w-full max-w-[390px] bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/95 to-[#0a0118]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl p-0 overflow-hidden pointer-events-auto animate-card-lift"
                {...swipeHandlers}
              >
                {/* Close button */}
                <button 
                  onClick={closeFriendCard}
                  className="absolute right-4 top-4 z-20 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <CloseIcon className="h-4 w-4 text-white" />
                  <span className="sr-only">Close</span>
                </button>
                
                {/* Three-dot menu positioned below the X close button */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="absolute right-4 top-10 z-20 rounded-sm hover:bg-white/10 transition-colors">
                    <MoreVertical className="h-4 w-4 text-white/60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#1a0f2e] border-[#a855f7]/40">
                    <DropdownMenuItem 
                      onClick={() => setShowReportDialog(true)}
                      className="text-white hover:bg-[#a855f7]/20 cursor-pointer"
                    >
                      <Flag className="h-4 w-4 mr-2" />
                      Report User
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleBlockUser}
                      className="text-red-400 hover:bg-red-500/20 cursor-pointer"
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Block User
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

              <div className="p-5 pt-8 relative">
                <div className="flex items-start gap-4 mb-4">
                {/* Large Avatar - with story ring if has stories, relationship-colored border */}
                <div className="relative flex-shrink-0">
                  {hasStory ? (
                    <button 
                      onClick={handleViewStory}
                      className="p-[3px] rounded-full bg-gradient-to-br from-[#d4ff00] via-[#d4ff00] to-[#a855f7] story-ring"
                    >
                      <div className="rounded-full bg-[#0a0118] p-[2px]">
                        <Avatar className="h-20 w-20">
                          <AvatarImage src={selectedFriend.avatarUrl || undefined} />
                          <AvatarFallback className="bg-[#2d1b4e] text-white text-2xl">
                            {selectedFriend.displayName[0]}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </button>
                  ) : (
                    <Avatar className={`h-20 w-20 border-[3px] ${
                      selectedFriend.relationshipType === 'close' ? 'border-[#d4ff00]' :
                      selectedFriend.relationshipType === 'mutual' ? 'border-[#6366f1]' :
                      'border-[#a855f7]'
                    }`}>
                      <AvatarImage src={selectedFriend.avatarUrl || undefined} />
                      <AvatarFallback className="bg-[#2d1b4e] text-white text-2xl">
                        {selectedFriend.displayName[0]}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  
                  {/* Relationship badge */}
                  {selectedFriend.relationshipType === 'close' && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1a0f2e] border-2 border-[#d4ff00] rounded-full flex items-center justify-center text-xs shadow-[0_0_8px_rgba(212,255,0,0.6)]">
                      💛
                    </div>
                  )}
                  {selectedFriend.relationshipType === 'mutual' && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1a0f2e] border-2 border-[#6366f1] rounded-full flex items-center justify-center text-xs shadow-[0_0_8px_rgba(99,102,241,0.6)]">
                      🔗
                    </div>
                  )}
                  {selectedFriend.relationshipType === 'direct' && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1a0f2e] border-2 border-[#a855f7] rounded-full flex items-center justify-center text-xs shadow-[0_0_8px_rgba(168,85,247,0.6)]">
                      👤
                    </div>
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 pr-8">
                    <h2 className="text-xl font-bold text-white leading-tight">
                      {selectedFriend.displayName}
                    </h2>
                    {selectedFriend.relationshipType === 'close' && (
                      <span className="text-xs bg-[#d4ff00]/20 text-[#d4ff00] px-2 py-0.5 rounded-full whitespace-nowrap">
                        Close Friend
                      </span>
                    )}
                    {selectedFriend.relationshipType === 'mutual' && (
                      <span className="text-xs bg-[#6366f1]/20 text-[#6366f1] px-2 py-0.5 rounded-full whitespace-nowrap">
                        Mutual
                      </span>
                    )}
                    {selectedFriend.relationshipType === 'direct' && (
                      <span className="text-xs bg-[#a855f7]/20 text-[#a855f7] px-2 py-0.5 rounded-full whitespace-nowrap">
                        Friend
                      </span>
                    )}
                  </div>
                  {demoEnabled ? (
                    <>
                      {selectedFriend.venueName && (
                        <button
                          onClick={() => handleVenueClick(selectedFriend.venueName!)}
                          className="text-[#d4ff00] text-base font-medium leading-tight mb-1 hover:underline text-left"
                        >
                          @ {selectedFriend.venueName}
                        </button>
                      )}
                      {distance !== null && (
                        <p className="text-white/50 text-sm leading-tight">
                          {distance.toFixed(1)} mi away
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {userStatus?.isOut && userStatus.currentVenue ? (
                        <button
                          onClick={() => handleVenueClick(userStatus.currentVenue!)}
                          className="text-[#d4ff00] text-base font-medium leading-tight mb-1 hover:underline text-left"
                        >
                          {statusSubtitle}
                        </button>
                      ) : statusSubtitle && (
                        <p className="text-white/70 text-base font-medium leading-tight mb-1">
                          {statusSubtitle}
                        </p>
                      )}
                      {distance !== null && userStatus?.isOut && (
                        <p className="text-white/50 text-sm leading-tight">
                          {distance.toFixed(1)} mi away
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Bottom Row: Friends + Buttons */}
              <div className="flex items-center gap-3">
              {/* Friends at Venue - Tappable with Popover */}
                {friendsAtVenue.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                        <div className="flex -space-x-2">
                          {friendsAtVenue.slice(0, 2).map((friend) => (
                            <Avatar key={friend.user_id} className="h-7 w-7 border-2 border-[#1a0f2e]">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {friendsAtVenue.length > 2 && (
                          <span className="text-white text-sm font-medium">+{friendsAtVenue.length - 2}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent 
                      className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl z-[70]"
                      align="start"
                      side="top"
                    >
                      <p className="text-white/60 text-xs px-2 mb-2">
                        Also here tonight
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {friendsAtVenue.map((friend) => (
                          <button
                            key={friend.user_id}
                            onClick={() => {
                              closeFriendCard();
                              setTimeout(() => {
                                openFriendCard({
                                  userId: friend.user_id,
                                  displayName: friend.display_name,
                                  avatarUrl: friend.avatar_url,
                                  venueName: selectedFriend?.venueName || userStatus?.currentVenue,
                                });
                              }, 100);
                            }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[#a855f7]/20 transition-colors"
                          >
                            <Avatar className="h-8 w-8 border border-[#a855f7]/40">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                                {friend.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-white text-sm font-medium flex-1 text-left">
                              {friend.display_name}
                            </span>
                            <ChevronRight className="h-4 w-4 text-white/40" />
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Action Buttons - Hidden for demo users only when demo mode is OFF (bootstrap/production) */}
                {(!isDemoUser || demoEnabled) && (
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      onClick={handleMeetUp}
                      className="flex-1 py-2 px-5 rounded-full border-2 border-[#d4ff00] text-[#d4ff00] text-sm font-semibold hover:bg-[#d4ff00]/10 transition-colors"
                    >
                      Meet Up
                    </button>
                    <button
                      onClick={handleOpenDM}
                      className="p-2 rounded-full bg-transparent border-2 border-white/20 text-white hover:bg-white/10 transition-colors"
                    >
                     <MessageCircle className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
      </>
    )}

    {/* Report Dialog */}
    {selectedFriend && (
      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        reportType="user"
        targetId={selectedFriend.userId}
        targetName={selectedFriend.displayName}
      />
    )}

    {/* Story Viewer */}
    {showStoryViewer && selectedFriend && (
      <StoryViewer
        userId={selectedFriend.userId}
        onClose={() => {
          setShowStoryViewer(false);
          closeFriendCard(); // Close card when done viewing stories
        }}
        allStoryUsers={[selectedFriend.userId]}
        currentUserIndex={0}
      />
    )}
  </>
);
}
