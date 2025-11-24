import { useEffect, useState } from 'react';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { X, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

export function FriendIdCard() {
  const { selectedUserId, closeFriendCard } = useFriendIdCard();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [friendData, setFriendData] = useState<FriendData | null>(null);
  const [nightStatus, setNightStatus] = useState<NightStatus | null>(null);
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendsAtVenue[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showMeetUpOptions, setShowMeetUpOptions] = useState(false);

  useEffect(() => {
    if (selectedUserId) {
      console.log('Friend ID Card opened for user:', selectedUserId);
      fetchFriendData();
      fetchUserLocation();
    } else {
      setFriendData(null);
      setNightStatus(null);
      setFriendsAtVenue([]);
      setDistance(null);
    }
  }, [selectedUserId]);

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

  const fetchFriendData = async () => {
    if (!selectedUserId) return;

    console.log('Fetching friend data for:', selectedUserId);

    // Fetch friend profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url, last_known_lat, last_known_lng')
      .eq('id', selectedUserId)
      .single();

    if (error) {
      console.error('Error fetching friend data:', error);
      return;
    }

    if (profile) {
      console.log('Friend data loaded:', profile);
      setFriendData(profile);

      // Fetch night status
      const { data: status } = await supabase
        .from('night_statuses')
        .select('venue_name, lat, lng')
        .eq('user_id', selectedUserId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (status) {
        setNightStatus(status);

        // Calculate distance if we have both locations
        if (userLocation && status.lat && status.lng) {
          const dist = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            status.lat,
            status.lng
          );
          setDistance(dist);
        }

        // Fetch other friends at the same venue
        if (status.venue_name) {
          const { data: friendships } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user?.id)
            .eq('status', 'accepted');

          const friendIds = friendships?.map(f => f.friend_id) || [];

          const { data: venueStatuses } = await supabase
            .from('night_statuses')
            .select('user_id, profiles:user_id(display_name, avatar_url)')
            .eq('venue_name', status.venue_name)
            .neq('user_id', selectedUserId)
            .in('user_id', friendIds)
            .gt('expires_at', new Date().toISOString());

          if (venueStatuses) {
            const friends = venueStatuses.map(s => ({
              user_id: s.user_id,
              display_name: (s.profiles as any)?.display_name || 'Friend',
              avatar_url: (s.profiles as any)?.avatar_url || null,
            }));
            setFriendsAtVenue(friends);
          }
        }
      }
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

  const handleOpenDM = async () => {
    if (!user || !selectedUserId) return;

    // Find or create thread
    const { data: existingThreads } = await supabase
      .from('dm_thread_members')
      .select('thread_id, dm_threads!inner(*)')
      .eq('user_id', user.id);

    let threadId: string | null = null;

    if (existingThreads) {
      for (const thread of existingThreads) {
        const { data: members } = await supabase
          .from('dm_thread_members')
          .select('user_id')
          .eq('thread_id', thread.thread_id);

        if (members?.length === 2 && members.some(m => m.user_id === selectedUserId)) {
          threadId = thread.thread_id;
          break;
        }
      }
    }

    if (!threadId) {
      const { data: newThread } = await supabase
        .from('dm_threads')
        .insert({})
        .select()
        .single();

      if (newThread) {
        await supabase.from('dm_thread_members').insert([
          { thread_id: newThread.id, user_id: user.id },
          { thread_id: newThread.id, user_id: selectedUserId },
        ]);
        threadId = newThread.id;
      }
    }

    if (threadId) {
      closeFriendCard();
      navigate(`/thread/${threadId}`);
    }
  };

  const handleSendMeetUpMessage = async () => {
    if (!user || !selectedUserId || !nightStatus?.venue_name) return;

    const { data: existingThreads } = await supabase
      .from('dm_thread_members')
      .select('thread_id')
      .eq('user_id', user.id);

    let threadId: string | null = null;

    if (existingThreads) {
      for (const thread of existingThreads) {
        const { data: members } = await supabase
          .from('dm_thread_members')
          .select('user_id')
          .eq('thread_id', thread.thread_id);

        if (members?.length === 2 && members.some(m => m.user_id === selectedUserId)) {
          threadId = thread.thread_id;
          break;
        }
      }
    }

    if (!threadId) {
      const { data: newThread } = await supabase
        .from('dm_threads')
        .insert({})
        .select()
        .single();

      if (newThread) {
        await supabase.from('dm_thread_members').insert([
          { thread_id: newThread.id, user_id: user.id },
          { thread_id: newThread.id, user_id: selectedUserId },
        ]);
        threadId = newThread.id;
      }
    }

    if (threadId) {
      await supabase.from('dm_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        text: `Want to meet up at ${nightStatus.venue_name}?`,
      });

      setShowMeetUpOptions(false);
      closeFriendCard();
      navigate(`/thread/${threadId}`);
    }
  };

  return (
    <Sheet open={!!selectedUserId} onOpenChange={(open) => !open && closeFriendCard()}>
      <SheetContent 
        side="bottom" 
        className="h-auto max-h-[80vh] bg-[#1a0f2e] border-t-2 border-[#a855f7] rounded-t-3xl"
      >
        <button
          onClick={closeFriendCard}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
        >
          <X className="h-6 w-6" />
        </button>

        {!friendData ? (
          <div className="py-6 px-4 flex items-center justify-center">
            <p className="text-white/60">Loading...</p>
          </div>
        ) : (
          <div className="py-6 px-4">
            {/* User Info Section */}
            <div className="flex items-start gap-4 mb-6">
              <Avatar className="h-20 w-20 border-[3px] border-[#a855f7]">
                <AvatarImage src={friendData.avatar_url || undefined} />
                <AvatarFallback className="bg-[#2d1b4e] text-white text-2xl">
                  {friendData.display_name[0]}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1">{friendData.display_name}</h2>
                {nightStatus?.venue_name && (
                  <p className="text-[#d4ff00] text-lg font-medium mb-1">
                    @ {nightStatus.venue_name}
                  </p>
                )}
                {distance !== null && (
                  <p className="text-white/50 text-sm">
                    {distance < 1 ? `${(distance * 5280).toFixed(0)} ft` : `${distance.toFixed(1)} mi`}
                  </p>
                )}
              </div>
            </div>

            {/* Friends at Venue */}
            {friendsAtVenue.length > 0 && (
              <div className="flex items-center gap-2 mb-6">
                <div className="flex -space-x-2">
                  {friendsAtVenue.slice(0, 3).map((friend) => (
                    <Avatar key={friend.user_id} className="h-8 w-8 border-2 border-[#1a0f2e]">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {friendsAtVenue.length > 3 && (
                  <span className="text-white text-sm font-medium">+{friendsAtVenue.length - 3}</span>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowMeetUpOptions(!showMeetUpOptions)}
                className="flex-1 py-3 px-6 rounded-full border-2 border-[#d4ff00] text-[#d4ff00] font-semibold hover:bg-[#d4ff00]/10 transition-colors"
              >
                Meet Up
              </button>
              <button
                onClick={handleOpenDM}
                className="p-3 rounded-full bg-[#2d1b4e] text-white hover:bg-[#3d2b5e] transition-colors"
              >
                <MessageCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Meet Up Options */}
            {showMeetUpOptions && nightStatus?.venue_name && (
              <div className="mt-4 p-4 bg-[#2d1b4e] rounded-2xl space-y-3">
                <button
                  onClick={handleSendMeetUpMessage}
                  className="w-full py-3 px-4 text-left text-white hover:bg-[#3d2b5e] rounded-xl transition-colors"
                >
                  Send DM: "Want to meet up at {nightStatus.venue_name}?"
                </button>
                <button
                  onClick={handleOpenDM}
                  className="w-full py-3 px-4 text-left text-white hover:bg-[#3d2b5e] rounded-xl transition-colors"
                >
                  Share my current location
                </button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
