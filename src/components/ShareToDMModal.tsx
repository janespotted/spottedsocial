import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Post } from '@/hooks/useFeed';

interface ShareToDMModalProps {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Friend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export function ShareToDMModal({ post, open, onOpenChange }: ShareToDMModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const demoEnabled = useDemoMode();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (open && friendIds && allProfiles) {
      let profiles = allProfiles.filter((p: any) => friendIds.includes(p.id));
      
      // Filter out demo users when demo mode is off
      if (!demoEnabled) {
        profiles = profiles.filter((p: any) => !p.is_demo);
      }
      
      const filtered = profiles.map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          username: p.username,
          avatar_url: p.avatar_url,
        }));
      setFriends(filtered);
    }
  }, [open, friendIds, allProfiles, demoEnabled]);

  const handleSend = useCallback(async (friendId: string) => {
    if (!user || !post) return;
    setSending(friendId);

    try {
      const { data: threadId, error } = await supabase.rpc('create_dm_thread', { friend_id: friendId });
      if (error) throw error;

      const truncatedText = post.text.length > 100 ? post.text.slice(0, 100) + '…' : post.text;
      const messageText = `📸 Shared a post: "${truncatedText}"${post.venue_name ? ` @ ${post.venue_name}` : ''}`;

      const { error: msgError } = await supabase.from('dm_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        text: messageText,
      });

      if (msgError) throw msgError;

      onOpenChange(false);
      toast.success('Post shared!');
      navigate(`/messages/${threadId}`);
    } catch (error) {
      console.error('Error sharing post:', error);
      toast.error('Failed to share post');
    } finally {
      setSending(null);
    }
  }, [user, post, navigate, onOpenChange]);

  const filteredFriends = friends.filter(
    (f) =>
      f.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Send to Friend</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends..."
            className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full pl-12"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {filteredFriends.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/60">No friends found</p>
            </div>
          ) : (
            filteredFriends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => handleSend(friend.id)}
                disabled={sending === friend.id}
                className="w-full bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-xl p-4 hover:bg-[#2d1b4e]/80 transition-colors flex items-center gap-3 disabled:opacity-50"
              >
                <Avatar className="h-10 w-10 border-2 border-[#a855f7]">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#1a0f2e] text-white">
                    {friend.display_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <h3 className="font-semibold text-white truncate">{friend.display_name}</h3>
                  <p className="text-white/60 text-sm truncate">@{friend.username}</p>
                </div>
                {sending === friend.id && (
                  <Loader2 className="h-5 w-5 text-[#a855f7] animate-spin" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
