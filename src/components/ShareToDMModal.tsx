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
import { Search, Loader2, Send } from 'lucide-react';
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
    if (!open || !friendIds || !allProfiles || !post) return;

    const loadEligibleFriends = async () => {
      // Get the post creator's friends to check privacy ring
      let eligibleIds = new Set<string>(friendIds);

      // If the post is not by the current user, filter by post creator's friend list
      if (post.user_id !== user?.id) {
        const [sent, received] = await Promise.all([
          supabase.from('friendships').select('friend_id').eq('user_id', post.user_id).eq('status', 'accepted'),
          supabase.from('friendships').select('user_id').eq('friend_id', post.user_id).eq('status', 'accepted'),
        ]);
        const posterFriendIds = new Set([
          ...(sent.data?.map(f => f.friend_id) || []),
          ...(received.data?.map(f => f.user_id) || []),
        ]);
        // Only show friends who are BOTH my friend AND the poster's friend
        eligibleIds = new Set(friendIds.filter(id => posterFriendIds.has(id)));
      }

      let profiles = allProfiles.filter((p: any) => eligibleIds.has(p.id));
      if (!demoEnabled) {
        profiles = profiles.filter((p: any) => !p.is_demo);
      }

      setFriends(profiles.map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
      })));
    };

    loadEligibleFriends();
  }, [open, friendIds, allProfiles, demoEnabled, post, user?.id]);

  const handleSend = useCallback(async (friendId: string) => {
    if (!user || !post) return;
    setSending(friendId);

    try {
      const { data: threadId, error } = await supabase.rpc('create_dm_thread', { friend_id: friendId });
      if (error) throw error;

      // Send structured message with post reference
      const messageText = `[shared_post:${post.id}]`;

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
      <DialogContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Send to Friend</DialogTitle>
        </DialogHeader>

        {/* Post preview */}
        {post && (
          <div className="flex items-center gap-3 bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-xl p-3">
            {post.image_url && (
              post.media_type === 'video' ? (
                <video
                  src={post.image_url}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <img
                  src={post.image_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              )
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{post.profiles?.display_name}</p>
              <p className="text-white/60 text-xs truncate">{post.text || 'Photo post'}</p>
              {post.venue_name && (
                <p className="text-[#d4ff00] text-[10px] truncate">@ {post.venue_name}</p>
              )}
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends..."
            className="bg-[#0a0118] border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full pl-11 h-10 text-sm"
          />
        </div>

        <div className="max-h-[40vh] overflow-y-auto space-y-1.5">
          {filteredFriends.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/60 text-sm">No eligible friends found</p>
              <p className="text-white/30 text-xs mt-1">Only mutual friends of the poster can receive this</p>
            </div>
          ) : (
            filteredFriends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => handleSend(friend.id)}
                disabled={sending === friend.id}
                className="w-full bg-[#2d1b4e]/40 border border-[#a855f7]/10 rounded-xl p-3 hover:bg-[#2d1b4e]/80 transition-colors flex items-center gap-3 disabled:opacity-50"
              >
                <Avatar className="h-9 w-9 border-2 border-[#a855f7]/40">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                    {friend.display_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <h3 className="font-medium text-white text-sm truncate">{friend.display_name}</h3>
                  <p className="text-white/40 text-xs truncate">@{friend.username}</p>
                </div>
                {sending === friend.id ? (
                  <Loader2 className="h-4 w-4 text-[#a855f7] animate-spin" />
                ) : (
                  <Send className="h-4 w-4 text-[#a855f7]" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
