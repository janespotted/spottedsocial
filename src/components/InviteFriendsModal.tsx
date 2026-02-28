import { useState, useEffect } from 'react';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendIds } from '@/hooks/useFriendIds';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Home, Share2 } from 'lucide-react';
import { getOrCreateInviteCode, getInviteLink, triggerSmsInvite } from '@/lib/sms-invite';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';

interface Friend {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: 'out' | 'planning' | 'home';
  venue_name: string | null;
  planning_neighborhood: string | null;
}

export function InviteFriendsModal() {
  const { showInviteModal, closeInviteModal, sendInvites, venueName, venueId } = useVenueInvite();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

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
      if (friendIds.length === 0) { setFriends([]); return; }

      const now = new Date().toISOString();

      let profileQuery = supabase
        .from('profiles')
        .select('id, display_name, avatar_url, is_demo')
        .in('id', friendIds);
      if (!demoEnabled) profileQuery = profileQuery.eq('is_demo', false);

      const [profilesRes, checkinsRes, nightRes] = await Promise.all([
        profileQuery,
        supabase.from('checkins').select('user_id, venue_name').in('user_id', friendIds).is('ended_at', null),
        supabase.from('night_statuses').select('user_id, status, planning_neighborhood, venue_name').in('user_id', friendIds).not('expires_at', 'is', null).gt('expires_at', now),
      ]);

      if (!profilesRes.data) { setFriends([]); return; }

      const checkinMap = new Map<string, string>();
      checkinsRes.data?.forEach(c => { if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, c.venue_name); });

      const nightMap = new Map<string, { status: string; planning_neighborhood: string | null; venue_name: string | null }>();
      nightRes.data?.forEach(n => { if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n); });

      const seenNames = new Set<string>();
      const friendsData: Friend[] = [];

      for (const profile of profilesRes.data) {
        if (seenNames.has(profile.display_name)) continue;
        seenNames.add(profile.display_name);

        let status: 'out' | 'planning' | 'home' = 'home';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;

        const activeCheckin = checkinMap.get(profile.id);
        const nightStatus = nightMap.get(profile.id);

        if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin;
        } else if (nightStatus?.status === 'out') {
          status = 'out';
          venue_name = nightStatus.venue_name || null;
        } else if (nightStatus?.status === 'planning') {
          status = 'planning';
          planning_neighborhood = nightStatus.planning_neighborhood;
        }

        friendsData.push({ id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url, status, venue_name, planning_neighborhood });
      }

      const STATUS_ORDER: Record<string, number> = { out: 0, planning: 1, home: 2 };
      friendsData.sort((a, b) => {
        const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return diff !== 0 ? diff : a.display_name.localeCompare(b.display_name);
      });

      setFriends(friendsData);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friendId)) newSelected.delete(friendId);
    else newSelected.add(friendId);
    setSelectedFriends(newSelected);
  };

  const handleSendInvites = async () => {
    const selected = friends.filter(f => selectedFriends.has(f.id));
    await sendInvites(selected.map(f => ({ id: f.id, displayName: f.display_name, avatarUrl: f.avatar_url })));
  };

  const outFriends = friends.filter(f => f.status === 'out');
  const planningFriends = friends.filter(f => f.status === 'planning');
  const homeFriends = friends.filter(f => f.status === 'home');

  const renderFriendRow = (friend: Friend) => (
    <button
      key={friend.id}
      onClick={() => handleToggleFriend(friend.id)}
      className="w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10 last:border-b-0"
    >
      <Checkbox
        checked={selectedFriends.has(friend.id)}
        onCheckedChange={() => handleToggleFriend(friend.id)}
        className="border-[#a855f7]"
      />
      <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50">
        <AvatarImage src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} />
        <AvatarFallback className="bg-[#a855f7] text-white text-sm">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-white font-semibold text-sm truncate">{friend.display_name}</p>
        {friend.status === 'out' ? (
          <p className="text-[#d4ff00] text-xs truncate">📍 At {friend.venue_name || 'Nearby'}</p>
        ) : friend.status === 'planning' ? (
          <p className="text-[#a855f7] text-xs truncate">🎯 Planning{friend.planning_neighborhood ? ` (${friend.planning_neighborhood})` : ' tonight'}</p>
        ) : (
          <p className="text-white/40 text-xs">Home</p>
        )}
      </div>
    </button>
  );

  return (
    <Dialog open={showInviteModal} onOpenChange={(open) => {
      if (!open) { closeInviteModal(); setSelectedFriends(new Set()); }
    }}>
      <DialogContent className="w-[90%] max-w-[400px] max-h-[80vh] bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/95 to-[#0a0118]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl p-0 overflow-hidden">
        <VisuallyHidden><DialogTitle>Invite Friends</DialogTitle></VisuallyHidden>
        <div className="p-5">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Invite Friends</h2>
            <p className="text-sm text-white/60">to {venueName}</p>
          </div>

          <ScrollArea className="h-[400px] mb-4">
            {loading ? (
              <div className="text-center text-white/50 py-8">Loading friends...</div>
            ) : friends.length === 0 ? (
              <div className="text-center text-white/50 py-8">No friends found</div>
            ) : (
              <div className="bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg overflow-hidden">
                {/* Friends Out Now */}
                {outFriends.length > 0 && (
                  <>
                    <div className="px-3 py-2">
                      <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                        👥 Friends Out Now
                        <span className="text-white/50 ml-1">({outFriends.length})</span>
                      </h3>
                    </div>
                    {outFriends.map(renderFriendRow)}
                  </>
                )}

                {/* Friends Planning */}
                {planningFriends.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
                      <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider">
                        🔥 Friends Planning 🎯
                        <span className="text-white/50 normal-case tracking-normal">({planningFriends.length})</span>
                      </p>
                    </div>
                    {planningFriends.map(renderFriendRow)}
                  </>
                )}

                {/* Staying In */}
                {homeFriends.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
                      <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider">
                        <Home className="h-3.5 w-3.5 text-white/50 inline mr-0.5" /> Staying In
                        <span className="text-white/50 normal-case tracking-normal">({homeFriends.length})</span>
                      </p>
                    </div>
                    {homeFriends.map(renderFriendRow)}
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
                  const { data: profile } = await supabase.rpc('get_profile_safe', { target_user_id: user.id });
                  const senderName = profile?.[0]?.display_name?.split(' ')[0] || 'Your friend';
                  const code = await getOrCreateInviteCode(user.id);
                  const link = getInviteLink(code, venueId || undefined);
                  await triggerSmsInvite({ senderName, venueName: venueName || undefined, inviteLink: link });
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
