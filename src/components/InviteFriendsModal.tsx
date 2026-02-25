import { useState, useEffect } from 'react';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useFriendIds } from '@/hooks/useFriendIds';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, MapPin, Target, Share2 } from 'lucide-react';
import { getOrCreateInviteCode, getInviteLink, triggerSmsInvite } from '@/lib/sms-invite';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';

interface Friend {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: 'planning' | 'out' | 'heading_out' | 'home' | 'off' | null;
  venue_name: string | null;
  planning_neighborhood: string | null;
}

export function InviteFriendsModal() {
  const { showInviteModal, closeInviteModal, sendInvites, venueName, venueId } = useVenueInvite();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const { data: allProfilesData } = useProfilesSafe();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(true);
  const [outOpen, setOutOpen] = useState(true);

  useEffect(() => {
    if (showInviteModal && user) {
      fetchFriends();
    } else {
      setSelectedFriends(new Set());
    }
  }, [showInviteModal, user]);

  const fetchFriends = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const friendIds = cachedFriendIds || [];

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      // Fetch night statuses
      const { data: nightStatuses } = await supabase
        .from('night_statuses')
        .select('user_id, status, venue_name, planning_neighborhood')
        .in('user_id', friendIds);

      const statusMap = new Map(
        (nightStatuses || []).map(ns => [ns.user_id, ns])
      );

      // Use cached profiles
      let profiles = (allProfilesData || [])
        .filter((p: any) => friendIds.includes(p.id))
        .sort((a: any, b: any) => a.display_name.localeCompare(b.display_name));

      if (!demoEnabled) {
        profiles = profiles.filter((p: any) => p.is_demo === false);
      }

      const seenNames = new Set<string>();
      const uniqueFriends: Friend[] = [];

      for (const profile of profiles) {
        if (seenNames.has(profile.display_name)) continue;
        seenNames.add(profile.display_name);

        const nightStatus = statusMap.get(profile.id);
        uniqueFriends.push({
          id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          status: nightStatus?.status || null,
          venue_name: nightStatus?.venue_name || null,
          planning_neighborhood: nightStatus?.planning_neighborhood || null,
        });
      }

      setFriends(uniqueFriends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId);
    } else {
      newSelected.add(friendId);
    }
    setSelectedFriends(newSelected);
  };

  const handleSendInvites = async () => {
    const selected = friends.filter(f => selectedFriends.has(f.id));
    await sendInvites(selected.map(f => ({
      id: f.id,
      displayName: f.display_name,
      avatarUrl: f.avatar_url
    })));
  };

  // Split friends into planning and out groups
  const planningFriends = friends.filter(f => f.status === 'planning');
  const outFriends = friends.filter(f => f.status === 'out' || f.status === 'heading_out');
  const otherFriends = friends.filter(f => f.status !== 'planning' && f.status !== 'out' && f.status !== 'heading_out');

  const renderFriendRow = (friend: Friend) => (
    <button
      key={friend.id}
      onClick={() => handleToggleFriend(friend.id)}
      className="w-full flex items-center gap-3 p-3 bg-[#2d1b4e]/30 rounded-xl hover:bg-[#2d1b4e]/50 transition-colors"
    >
      <Checkbox 
        checked={selectedFriends.has(friend.id)}
        onCheckedChange={() => handleToggleFriend(friend.id)}
        className="border-[#a855f7]"
      />
      <Avatar className="w-10 h-10">
        <AvatarImage src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} />
        <AvatarFallback className="bg-[#a855f7] text-white">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 text-left">
        <span className="text-white font-medium block">
          {friend.display_name}
        </span>
        {friend.status === 'planning' && (
          <span className="text-[#d4ff00] text-sm flex items-center gap-1">
            <Target className="h-3 w-3" />
            Planning{friend.planning_neighborhood ? ` (${friend.planning_neighborhood})` : ' tonight'}
          </span>
        )}
        {(friend.status === 'out' || friend.status === 'heading_out') && friend.venue_name && (
          <span className="text-[#d4ff00] text-sm flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            At {friend.venue_name}
          </span>
        )}
        {friend.status !== 'planning' && friend.status !== 'out' && friend.status !== 'heading_out' && friend.venue_name && (
          <span className="text-white/50 text-sm flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            At {friend.venue_name}
          </span>
        )}
      </div>
    </button>
  );

  return (
    <Dialog open={showInviteModal} onOpenChange={(open) => {
      if (!open) {
        closeInviteModal();
        setSelectedFriends(new Set());
      }
    }}>
      <DialogContent className="w-[90%] max-w-[400px] max-h-[80vh] bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/95 to-[#0a0118]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl p-0 overflow-hidden">
        <div className="p-5">
          {/* Header */}
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Invite Friends</h2>
            <p className="text-sm text-white/60">to {venueName}</p>
          </div>

          {/* Friends List */}
          <ScrollArea className="h-[400px] mb-4">
            {loading ? (
              <div className="text-center text-white/50 py-8">Loading friends...</div>
            ) : friends.length === 0 ? (
              <div className="text-center text-white/50 py-8">No friends found</div>
            ) : (
              <div className="space-y-4">
                {/* Planning Friends Section */}
                {planningFriends.length > 0 && (
                  <Collapsible open={planningOpen} onOpenChange={setPlanningOpen}>
                    <CollapsibleTrigger className="w-full flex items-center justify-between py-2 px-1 hover:bg-white/5 rounded-lg transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🔥</span>
                        <span className="font-semibold text-white">Friends Planning</span>
                        <span className="text-lg">🎯</span>
                        <span className="text-white/50 text-sm">({planningFriends.length})</span>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-white/60 transition-transform duration-200 ${planningOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="space-y-2">
                        {planningFriends.map(renderFriendRow)}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Divider */}
                {planningFriends.length > 0 && outFriends.length > 0 && (
                  <div className="border-t border-white/10 my-2" />
                )}

                {/* Out Friends Section */}
                {outFriends.length > 0 && (
                  <Collapsible open={outOpen} onOpenChange={setOutOpen}>
                    <CollapsibleTrigger className="w-full flex items-center justify-between py-2 px-1 hover:bg-white/5 rounded-lg transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎉</span>
                        <span className="font-semibold text-white">Friends Out</span>
                        <span className="text-white/50 text-sm">({outFriends.length})</span>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-white/60 transition-transform duration-200 ${outOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="space-y-2">
                        {outFriends.map(renderFriendRow)}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Other Friends (home or no status) */}
                {otherFriends.length > 0 && (
                  <>
                    {(planningFriends.length > 0 || outFriends.length > 0) && (
                      <div className="border-t border-white/10 my-2" />
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 py-2 px-1">
                        <span className="font-semibold text-white/70">Other Friends</span>
                        <span className="text-white/40 text-sm">({otherFriends.length})</span>
                      </div>
                      {otherFriends.map(renderFriendRow)}
                    </div>
                  </>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Invite from Contacts */}
          <div className="border-t border-white/10 pt-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Share2 className="h-4 w-4 text-[#d4ff00]" />
              <span className="font-semibold text-white text-sm">Invite from Contacts</span>
            </div>
            <p className="text-white/50 text-xs mb-3">
              Invite friends who aren't on Spotted yet via text message
            </p>
            <Button
              onClick={async () => {
                if (!user) return;
                haptic.light();
                try {
                  const { data: profile } = await supabase
                    .rpc('get_profile_safe', { target_user_id: user.id });
                  const senderName = profile?.[0]?.display_name?.split(' ')[0] || 'Your friend';
                  const code = await getOrCreateInviteCode(user.id);
                  const link = getInviteLink(code, venueId || undefined);
                  await triggerSmsInvite({
                    senderName,
                    venueName: venueName || undefined,
                    inviteLink: link,
                  });
                } catch (err) {
                  console.error('SMS invite error:', err);
                  toast.error('Could not open share sheet');
                }
              }}
              variant="outline"
              className="w-full border-[#d4ff00]/40 text-[#d4ff00] hover:bg-[#d4ff00]/10"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Send Text Invite
            </Button>
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSendInvites}
            disabled={selectedFriends.size === 0}
            className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Invites {selectedFriends.size > 0 && `(${selectedFriends.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
