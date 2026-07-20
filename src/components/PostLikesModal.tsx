import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';

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
  const { openFriendCard } = useFriendIdCard();

  useEffect(() => {
    if (isOpen && postId) {
      fetchLikes();
    }
  }, [isOpen, postId]);

  const fetchLikes = async () => {
    setLoading(true);
    try {
      const [likesResult, profileResult] = await Promise.all([
        supabase
          .from('post_likes')
          .select('user_id')
          .eq('post_id', postId)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_profiles_safe'),
      ]);

      if (likesResult.data) {
        const profileMap = new Map(
          (profileResult.data || []).map((p: any) => [p.id, p])
        );
        const likesData = likesResult.data.map((like: any) => {
          const profile = profileMap.get(like.user_id);
          return {
            user_id: like.user_id,
            display_name: profile?.display_name || 'Unknown',
            username: profile?.username || 'unknown',
            avatar_url: profile?.avatar_url || null,
          };
        });
        setUsers(likesData);
      }
    } catch (err) {
      console.error('Failed to load likes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUserTap = (user: LikeUser) => {
    onClose();
    openFriendCard({
      userId: user.user_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    });
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()} shouldScaleBackground={false}>
      <DrawerContent className="bg-[#1a0f2e] border-none rounded-t-2xl max-h-[60vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-center h-12 border-b border-white/[0.06] flex-shrink-0">
          <h3 className="text-white font-semibold text-base">Likes</h3>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="text-white/40 text-sm text-center py-8">Loading...</div>
          ) : users.length === 0 ? (
            <div className="text-white/40 text-sm text-center py-8">No likes yet</div>
          ) : (
            <div>
              {users.map((user) => (
                <button
                  key={user.user_id}
                  onClick={() => handleUserTap(user)}
                  className="w-full flex items-center gap-3 px-4 py-3 pressable-row"
                >
                  <Avatar className="h-11 w-11 flex-shrink-0">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
                      {user.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-[15px] text-white truncate">{user.display_name}</p>
                    <p className="text-[13px] text-white/40 truncate">@{user.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
