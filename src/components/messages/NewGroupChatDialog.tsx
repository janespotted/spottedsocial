import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useFriendIds } from '@/hooks/useFriendIds';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ArrowLeft, X, Check, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface NewGroupChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewGroupChatDialog({ open, onOpenChange }: NewGroupChatDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const { data: allProfilesData } = useProfilesSafe();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState<'select' | 'name'>('select');
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchFriends();
      // Reset state when opening
      setSelectedFriends([]);
      setSearch('');
      setStep('select');
      setGroupName('');
    }
  }, [open, user]);

  const fetchFriends = async () => {
    setLoading(true);
    try {
      const friendIds = cachedFriendIds || [];

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      // Get user's threads for recency sorting
      const { data: userThreadsData } = await supabase
        .from('dm_thread_members')
        .select('thread_id')
        .eq('user_id', user?.id);

      // Get recent messages to determine recency
      const threadIds = userThreadsData?.map(t => t.thread_id) || [];
      const recentFriendIds: string[] = [];
      
      if (threadIds.length > 0) {
        const { data: recentMessages } = await supabase
          .from('dm_messages')
          .select('thread_id, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
          .limit(50);

        if (recentMessages && recentMessages.length > 0) {
          const recentThreadIds = [...new Set(recentMessages.map(m => m.thread_id))];
          
          const { data: threadMembers } = await supabase
            .from('dm_thread_members')
            .select('thread_id, user_id')
            .in('thread_id', recentThreadIds)
            .neq('user_id', user?.id);

          if (threadMembers) {
            for (const threadId of recentThreadIds) {
              const members = threadMembers.filter(m => m.thread_id === threadId);
              for (const member of members) {
                if (!recentFriendIds.includes(member.user_id)) {
                  recentFriendIds.push(member.user_id);
                }
              }
            }
          }
        }
      }

      // Use cached profiles
      let profiles = (allProfilesData || []).filter((p: any) => friendIds.includes(p.id));
      
      if (!demoEnabled) {
        profiles = profiles.filter((p: any) => p.is_demo === false);
      }

      // Deduplicate by display_name
      const seenNames = new Set<string>();
      const uniqueProfiles = profiles.filter((profile: any) => {
        if (seenNames.has(profile.display_name)) return false;
        seenNames.add(profile.display_name);
        return true;
      });

      // Sort: recent conversations first, then alphabetical
      uniqueProfiles.sort((a: any, b: any) => {
        const aRecentIndex = recentFriendIds.indexOf(a.id);
        const bRecentIndex = recentFriendIds.indexOf(b.id);
        
        if (aRecentIndex !== -1 && bRecentIndex !== -1) {
          return aRecentIndex - bRecentIndex;
        }
        if (aRecentIndex !== -1) return -1;
        if (bRecentIndex !== -1) return 1;
        return a.display_name.localeCompare(b.display_name);
      });

      setFriends(uniqueProfiles);
    } finally {
      setLoading(false);
    }
  };

  const toggleFriend = (friend: Friend) => {
    setSelectedFriends(prev => {
      const isSelected = prev.some(f => f.id === friend.id);
      if (isSelected) {
        return prev.filter(f => f.id !== friend.id);
      }
      return [...prev, friend];
    });
  };

  const removeFriend = (friendId: string) => {
    setSelectedFriends(prev => prev.filter(f => f.id !== friendId));
  };

  const createGroup = async () => {
    if (selectedFriends.length < 2) {
      toast.error('Select at least 2 friends for a group');
      return;
    }

    setIsCreating(true);
    try {
      const memberIds = selectedFriends.map(f => f.id);
      const name = groupName.trim() || null;

      const { data: threadId, error } = await supabase.rpc('create_group_thread', {
        member_ids: memberIds,
        group_name: name,
      });

      if (error) throw error;

      toast.success('Group created!');
      onOpenChange(false);
      navigate(`/messages/${threadId}`);
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredFriends = friends.filter(
    friend =>
      friend.display_name.toLowerCase().includes(search.toLowerCase()) ||
      friend.username.toLowerCase().includes(search.toLowerCase())
  );

  const generateDefaultName = () => {
    if (selectedFriends.length === 0) return '';
    const names = selectedFriends.map(f => f.display_name.split(' ')[0]);
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} & ${names.length - 2} others`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white p-0 max-w-md">
        {step === 'select' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#a855f7]/20">
              <button
                onClick={() => onOpenChange(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <h2 className="text-lg font-semibold">New Group</h2>
              <button
                onClick={() => setStep('name')}
                disabled={selectedFriends.length < 2}
                className="text-[#a855f7] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>

            {/* Selected Friends Pills */}
            {selectedFriends.length > 0 && (
              <div className="px-4 pt-3 flex flex-wrap gap-2">
                {selectedFriends.map(friend => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-1.5 bg-[#a855f7]/20 border border-[#a855f7]/40 rounded-full pl-1 pr-2 py-1"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                        {friend.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-white">{friend.display_name.split(' ')[0]}</span>
                    <button
                      onClick={() => removeFriend(friend.id)}
                      className="text-white/60 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search friends..."
                  className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full pl-12"
                />
              </div>
            </div>

            {/* To label */}
            <div className="px-4 pb-2">
              <span className="text-white/60 text-sm">To:</span>
              <span className="text-white/40 text-sm ml-2">
                {selectedFriends.length === 0 
                  ? 'Select at least 2 people' 
                  : `${selectedFriends.length} selected`}
              </span>
            </div>

            {/* Friends List */}
            <div className="max-h-[40vh] overflow-y-auto px-4 pb-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-[#a855f7] border-t-transparent rounded-full" />
                  <span className="ml-3 text-white/60">Loading friends...</span>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="text-center py-8 text-white/50">
                  {search ? 'No friends match your search' : 'No friends found'}
                </div>
              ) : (
                <>
                  <p className="text-xs text-white/50 uppercase tracking-wide mb-2 px-1">Suggested</p>
                  <div className="space-y-1">
                    {filteredFriends.map(friend => {
                      const isSelected = selectedFriends.some(f => f.id === friend.id);
                      return (
                        <button
                          key={friend.id}
                          onClick={() => toggleFriend(friend)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#2d1b4e]/60 transition-colors"
                        >
                          <Avatar className="h-12 w-12 border-2 border-[#a855f7]/40">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#2d1b4e] text-white">
                              {friend.display_name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-white">{friend.display_name}</p>
                            <p className="text-sm text-white/50">@{friend.username}</p>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-[#a855f7] border-[#a855f7]'
                                : 'border-white/30'
                            }`}
                          >
                            {isSelected && <Check className="h-4 w-4 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Name Step Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#a855f7]/20">
              <button
                onClick={() => setStep('select')}
                className="text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold">Name Group</h2>
              <button
                onClick={createGroup}
                disabled={isCreating}
                className="text-[#a855f7] font-semibold disabled:opacity-40"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Group Avatar Preview */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-[#2d1b4e] border-2 border-[#a855f7]/40 flex items-center justify-center overflow-hidden">
                    {selectedFriends.length <= 4 ? (
                      <div className="grid grid-cols-2 gap-0.5 w-full h-full p-1">
                        {selectedFriends.slice(0, 4).map((friend, idx) => (
                          <Avatar key={friend.id} className="w-full h-full rounded-sm">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#1a0f2e] text-white text-xs rounded-sm">
                              {friend.display_name[0]}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    ) : (
                      <Users className="h-10 w-10 text-[#a855f7]" />
                    )}
                  </div>
                </div>
              </div>

              {/* Group Name Input */}
              <div className="space-y-2">
                <label className="text-sm text-white/60">Group name</label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={generateDefaultName()}
                  maxLength={50}
                  className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-xl text-center text-lg"
                />
                <p className="text-xs text-white/40 text-center">
                  {50 - groupName.length} characters remaining
                </p>
              </div>

              {/* Members Preview */}
              <div className="space-y-2">
                <p className="text-sm text-white/60">Members ({selectedFriends.length + 1})</p>
                <div className="flex flex-wrap gap-2">
                  {/* Current user */}
                  <div className="text-sm text-white/80 bg-[#2d1b4e]/60 px-3 py-1 rounded-full">
                    You
                  </div>
                  {selectedFriends.map(friend => (
                    <div
                      key={friend.id}
                      className="text-sm text-white/80 bg-[#2d1b4e]/60 px-3 py-1 rounded-full"
                    >
                      {friend.display_name.split(' ')[0]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}