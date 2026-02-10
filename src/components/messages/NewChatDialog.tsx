import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useFriendIds } from '@/hooks/useFriendIds';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Users } from 'lucide-react';
import { NewGroupChatDialog } from './NewGroupChatDialog';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  venue_name: string | null;
}

interface PreselectedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedUser?: PreselectedUser | null;
}

export function NewChatDialog({ open, onOpenChange, preselectedUser }: NewChatDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const { data: allProfiles } = useProfilesSafe();
  const { data: friendIds } = useFriendIds(user?.id);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const isCreatingRef = useRef(false);

  // Wait for Supabase auth session to be ready
  const waitForAuthSession = async (maxRetries = 10): Promise<boolean> => {
    for (let i = 0; i < maxRetries; i++) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  };

  useEffect(() => {
    if (open && user) {
      fetchFriends();
    }
  }, [open, user]);

  useEffect(() => {
    // If we have a preselected user, automatically create thread
    if (open && preselectedUser && user && !isCreatingRef.current) {
      isCreatingRef.current = true;
      setIsCreatingThread(true);
      createThreadWithPreselectedUser().finally(() => {
        // Only reset if dialog is still open (prevents race conditions)
        if (!open) {
          isCreatingRef.current = false;
        }
      });
    }
  }, [open, preselectedUser, user]);

  useEffect(() => {
    if (!open) {
      setIsCreatingThread(false);
      isCreatingRef.current = false;
    }
  }, [open]);

  const createThreadWithPreselectedUser = async () => {
    if (!preselectedUser || !user) return;
    await createThread(preselectedUser.id);
  };

  const fetchFriends = async () => {
    if (!friendIds || friendIds.length === 0 || !allProfiles) {
      setFriends([]);
      return;
    }

    // Fetch venue statuses
    const { data: statusesData } = await supabase
      .from('night_statuses')
      .select('user_id, venue_name')
      .in('user_id', friendIds);

    let profiles = allProfiles.filter((p: any) => friendIds.includes(p.id));
    
    // Only filter out demo users when demo mode is OFF (bootstrap mode)
    if (!demoEnabled) {
      profiles = profiles.filter((p: any) => p.is_demo === false);
    }

    // Deduplicate by display_name (keeps first occurrence)
    const seenNames = new Set<string>();
    const uniqueProfiles = profiles.filter(profile => {
      if (seenNames.has(profile.display_name)) return false;
      seenNames.add(profile.display_name);
      return true;
    });

    // Create venue status lookup map for O(1) access
    const venueMap = new Map(
      (statusesData || []).map(s => [s.user_id, s.venue_name])
    );

    // Map profiles with venue info (no additional queries needed)
    const friendsData = uniqueProfiles.map(profile => ({
      ...profile,
      venue_name: venueMap.get(profile.id) || null,
    }));

    setFriends(friendsData);
  };

  const createThread = async (friendId: string) => {
    try {
      // Wait for auth session to be fully ready
      const isAuthenticated = await waitForAuthSession();
      if (!isAuthenticated) {
        console.error('Auth session not ready after retries');
        setIsCreatingThread(false);
        isCreatingRef.current = false;
        return;
      }

      // Use SECURITY DEFINER function to create/find thread
      const { data: threadId, error } = await supabase
        .rpc('create_dm_thread', { friend_id: friendId });

      if (error) {
        console.error('Thread creation error:', error);
        throw error;
      }

      onOpenChange(false);
      navigate(`/messages/${threadId}`);
    } catch (error) {
      console.error('Error in createThread:', error);
      setIsCreatingThread(false);
      isCreatingRef.current = false;
    }
  };

  const handleCreateGroup = () => {
    onOpenChange(false);
    setShowGroupDialog(true);
  };

  const filteredFriends = friends.filter(
    (friend) =>
      friend.display_name.toLowerCase().includes(search.toLowerCase()) ||
      friend.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white">
          {(isCreatingThread || preselectedUser) ? (
            <div className="py-12 text-center">
              <div className="animate-pulse text-white/60">
                Opening chat with {preselectedUser?.display_name}...
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">New Message</DialogTitle>
              </DialogHeader>

              {/* Create Group Button */}
              <button
                onClick={handleCreateGroup}
                className="w-full flex items-center gap-3 bg-[#2d1b4e]/60 border border-[#a855f7]/30 rounded-xl p-4 hover:bg-[#2d1b4e]/80 transition-colors mb-2"
              >
                <div className="w-12 h-12 rounded-full bg-[#a855f7]/20 border-2 border-[#a855f7]/40 flex items-center justify-center">
                  <Users className="h-6 w-6 text-[#a855f7]" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-white">Create Group</h3>
                  <p className="text-white/50 text-sm">Message multiple friends at once</p>
                </div>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-[#a855f7]/20" />
                <span className="text-white/40 text-sm">or message someone</span>
                <div className="flex-1 h-px bg-[#a855f7]/20" />
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search friends..."
                  className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full pl-12"
                />
              </div>

              {/* Friends List */}
              <div className="max-h-[50vh] overflow-y-auto space-y-2">
                {filteredFriends.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-white/60">No friends found</p>
                    <p className="text-white/40 text-sm mt-2">
                      Add friends to start messaging
                    </p>
                  </div>
                ) : (
                  filteredFriends.map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => createThread(friend.id)}
                      className="w-full bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-xl p-4 hover:bg-[#2d1b4e]/80 transition-colors flex items-center gap-3"
                    >
                      <Avatar className="h-12 w-12 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 text-left min-w-0">
                        <h3 className="font-semibold text-white truncate">
                          {friend.display_name}
                        </h3>
                        <p className="text-white/60 text-sm truncate">
                          @{friend.username}
                        </p>
                      </div>

                      {friend.venue_name && (
                        <div className="text-[#d4ff00] text-sm font-medium">
                          @{friend.venue_name}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Group Chat Dialog */}
      <NewGroupChatDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
      />
    </>
  );
}
