import { useState, useEffect, useMemo } from 'react';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Home, Share2, Users, ChevronRight, X } from 'lucide-react';
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
  const { data: allProfiles, isLoading: profilesLoading } = useProfilesSafe();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Filter profiles to only friends
  const friendProfiles = useMemo(() => {
    if (!allProfiles || !cachedFriendIds) return [];
    const friendSet = new Set(cachedFriendIds);
    let filtered = allProfiles.filter(p => friendSet.has(p.id));
    if (!demoEnabled) filtered = filtered.filter(p => !p.is_demo);
    return filtered;
  }, [allProfiles, cachedFriendIds, demoEnabled]);

  useEffect(() => {
    if (showInviteModal && user && friendProfiles.length > 0) {
      fetchStatuses();
    } else if (!showInviteModal) {
      setSelectedFriends(new Set());
    }
  }, [showInviteModal, user, friendProfiles]);

  const fetchStatuses = async () => {
    if (!user || friendProfiles.length === 0) { setFriends([]); return; }
    setLoading(true);
    try {
      const friendIds = friendProfiles.map(p => p.id);
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [checkinsRes, nightRes] = await Promise.all([
        supabase.from('checkins').select('user_id, venue_name, started_at').in('user_id', friendIds).is('ended_at', null).gt('started_at', twentyFourHoursAgo).order('started_at', { ascending: false }),
        supabase.from('night_statuses').select('user_id, status, planning_neighborhood, venue_name, updated_at, is_private_party, party_neighborhood').in('user_id', friendIds).not('expires_at', 'is', null).gt('expires_at', now),
      ]);

      const checkinMap = new Map<string, { venue_name: string; started_at: string | null }>();
      checkinsRes.data?.forEach(c => { if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, { venue_name: c.venue_name, started_at: c.started_at }); });

      const nightMap = new Map<string, { status: string; planning_neighborhood: string | null; venue_name: string | null; updated_at: string | null; is_private_party: boolean | null; party_neighborhood: string | null }>();
      nightRes.data?.forEach(n => { if (!nightMap.has(n.user_id)) nightMap.set(n.user_id, n); });

      const seenNames = new Set<string>();
      const friendsData: Friend[] = [];

      for (const profile of friendProfiles) {
        if (seenNames.has(profile.display_name)) continue;
        seenNames.add(profile.display_name);

        let status: 'out' | 'planning' | 'home' = 'home';
        let venue_name: string | null = null;
        let planning_neighborhood: string | null = null;

        const activeCheckin = checkinMap.get(profile.id);
        const nightStatus = nightMap.get(profile.id);

        const checkinTime = activeCheckin?.started_at ? new Date(activeCheckin.started_at).getTime() : 0;
        const nightTime = nightStatus?.updated_at ? new Date(nightStatus.updated_at).getTime() : 0;

        if (nightStatus?.status === 'out' && nightTime >= checkinTime) {
          status = 'out';
          if (nightStatus.is_private_party) {
            venue_name = nightStatus.party_neighborhood ? `Private Party (${nightStatus.party_neighborhood})` : 'Private Party';
          } else {
            venue_name = nightStatus.venue_name || null;
          }
        } else if (activeCheckin) {
          status = 'out';
          venue_name = activeCheckin.venue_name;
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
      className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors rounded-xl"
    >
      <Checkbox
        checked={selectedFriends.has(friend.id)}
        onCheckedChange={() => handleToggleFriend(friend.id)}
        className="border-white/20 data-[state=checked]:bg-[#d4ff00] data-[state=checked]:border-[#d4ff00] data-[state=checked]:text-black"
      />
      <Avatar className="w-9 h-9 flex-shrink-0 border-2 border-white/15">
        <AvatarImage src={friend.avatar_url || undefined} />
        <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
        {friend.status === 'out' ? (
          <p className="text-[#d4ff00] text-xs truncate">At {friend.venue_name || 'Nearby'}</p>
        ) : friend.status === 'planning' ? (
          <p className="text-[#a855f7] text-xs truncate">TBD{friend.planning_neighborhood ? ` · ${friend.planning_neighborhood}` : ''}</p>
        ) : (
          <p className="text-white/30 text-xs">Home</p>
        )}
      </div>
    </button>
  );

  return (
    <Dialog open={showInviteModal} onOpenChange={(open) => {
      if (!open) { closeInviteModal(); setSelectedFriends(new Set()); }
    }}>
      <DialogContent className="w-[90%] max-w-[400px] max-h-[80vh] bg-[#1a1030] border border-white/10 rounded-3xl p-0 overflow-hidden flex flex-col shadow-[0_0_40px_rgba(168,85,247,0.1)] [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Invite Friends</DialogTitle></VisuallyHidden>
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="p-5 pb-3 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Invite Friends</h2>
              <p className="text-sm text-white/50">to <span className="text-[#d4ff00]">{venueName}</span></p>
            </div>
            <button
              onClick={() => { closeInviteModal(); setSelectedFriends(new Set()); }}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/15 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4 text-white/70" />
            </button>
          </div>

          {/* Scrollable content */}
          <ScrollArea className="flex-1 min-h-0 px-5">
            {loading ? (
              <div className="text-center text-white/50 py-8">Loading friends...</div>
            ) : friends.length === 0 ? (
              <div className="flex items-center gap-3 py-6">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-white/30" />
                </div>
                <span className="text-white/40 text-sm">No friends found</span>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden">
                {outFriends.length > 0 && (
                  <>
                    <div className="px-1 py-2">
                      <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                        Friends Out Now
                        <span className="text-white/30 ml-1">({outFriends.length})</span>
                      </h3>
                    </div>
                    {outFriends.map(renderFriendRow)}
                  </>
                )}
                {planningFriends.length > 0 && (
                  <>
                    <div className="px-1 py-2 mt-1">
                      <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                        TBD tonight
                        <span className="text-white/30 ml-1">({planningFriends.length})</span>
                      </p>
                    </div>
                    {planningFriends.map(renderFriendRow)}
                  </>
                )}
                {homeFriends.length > 0 && (
                  <>
                    <div className="px-1 py-2 mt-1">
                      <p className="text-white/50 text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider">
                        <Home className="h-3.5 w-3.5 text-white/30" /> Staying in
                        <span className="text-white/30 ml-1">({homeFriends.length})</span>
                      </p>
                    </div>
                    {homeFriends.map(renderFriendRow)}
                  </>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-white/10 my-4" />

            {/* Invite from Contacts */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Share2 className="h-4 w-4 text-[#d4ff00]" />
                <span className="font-semibold text-white text-sm">Invite from Contacts</span>
              </div>
              <p className="text-white/40 text-xs mb-3">
                Invite friends who aren't on Spotted yet via text message
              </p>
              <button
                onClick={async () => {
                  if (!user) return;
                  haptic.light();
                  try {
                    const { data: profile } = await supabase.from('profiles').select('id, display_name, username, avatar_url, is_demo').eq('id', user.id);
                    const senderName = profile?.[0]?.display_name?.split(' ')[0] || 'Your friend';
                    const code = await getOrCreateInviteCode(user.id);
                    const link = getInviteLink(code, venueId || undefined);
                    await triggerSmsInvite({ senderName, venueName: venueName || undefined, inviteLink: link });
                  } catch (err) {
                    console.error('SMS invite error:', err);
                    toast.error('Could not open share sheet');
                  }
                }}
                className="w-full flex items-center gap-3 h-11 px-4 rounded-xl border border-[#d4ff00]/40 text-[#d4ff00] text-sm font-semibold hover:bg-[#d4ff00]/5 transition-colors"
              >
                <Share2 className="h-4 w-4" />
                <span className="flex-1 text-left">Send Text Invite</span>
                <ChevronRight className="h-4 w-4 text-[#d4ff00]/60" />
              </button>
            </div>
          </ScrollArea>

          {/* Fixed bottom button */}
          <div className="p-5 pt-3">
            <Button
              onClick={handleSendInvites}
              disabled={selectedFriends.size === 0}
              className="w-full h-12 bg-[#a855f7] hover:bg-[#a855f7]/90 text-white font-semibold text-base rounded-xl disabled:opacity-40"
            >
              Send Invites {selectedFriends.size > 0 && `(${selectedFriends.size})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
