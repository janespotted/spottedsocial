import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PostLikesModalProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface LikeUser {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export function PostLikesModal({ postId, isOpen, onClose }: PostLikesModalProps) {
  const [users, setUsers] = useState<LikeUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && postId) {
      fetchLikes();
    }
  }, [isOpen, postId]);

  const fetchLikes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('post_likes')
      .select(`
        user_id,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: false });

    if (data) {
      const likesData = data.map((like: any) => ({
        user_id: like.user_id,
        display_name: like.profiles?.display_name || 'Unknown',
        username: like.profiles?.username || 'unknown',
        avatar_url: like.profiles?.avatar_url || null,
      }));
      setUsers(likesData);
    }
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a0f2e] border-2 border-[#a855f7]/40">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Likes</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px] pr-4">
          {loading ? (
            <div className="text-white/60 text-center py-8">Loading...</div>
          ) : users.length === 0 ? (
            <div className="text-white/60 text-center py-8">No likes yet</div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#a855f7]/10 transition-colors"
                >
                  <Avatar className="h-10 w-10 border-2 border-[#a855f7]">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#0a0118] text-white">
                      {user.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-white">{user.display_name}</p>
                    <p className="text-sm text-white/60">@{user.username}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
