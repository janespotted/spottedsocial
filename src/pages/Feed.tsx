import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CreatePostDialog } from '@/components/CreatePostDialog';
import { useDemoMode } from '@/hooks/useDemoMode';

interface Post {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  venue_name: string | null;
  created_at: string;
  profiles: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

interface Friend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export default function Feed() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showCreatePost, setShowCreatePost] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchPosts();
      subscribeToNewPosts();
    }
  }, [user, demoEnabled]);

  const fetchFriends = async () => {
    let query = supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const { data: friendships } = await query;

    if (friendships && friendships.length > 0) {
      const friendIds = friendships.map(f => f.friend_id);
      
      let profileQuery = supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', friendIds);

      // Filter demo data unless demo mode is enabled
      if (!demoEnabled) {
        profileQuery = profileQuery.eq('is_demo', false);
      }

      const { data: friendProfiles } = await profileQuery;

      if (friendProfiles) {
        setFriends(friendProfiles.map(f => ({
          user_id: f.id,
          display_name: f.display_name,
          avatar_url: f.avatar_url,
        })));
      }
    }
  };

  const fetchPosts = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const friendIds = friendships?.map(f => f.friend_id) || [];
    const userIds = [user?.id, ...friendIds];

    let query = supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .in('user_id', userIds)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    // Filter demo data unless demo mode is enabled
    if (!demoEnabled) {
      query = query.eq('is_demo', false);
    }

    const { data } = await query;

    setPosts(data || []);
  };

  const subscribeToNewPosts = () => {
    const channel = supabase
      .channel('posts_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getTimeAgo = (date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    // Simplify to just show "15m", "2h", etc.
    return distance.replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h')
      .replace(' days', 'd').replace(' day', 'd');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#2d1b4e] border-b border-[#4a3566]">
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div>
            <h1 className="text-2xl font-light tracking-[0.3em] text-white mb-1">Spotted</h1>
            <h2 className="text-3xl font-bold text-white">Newsfeed</h2>
            <p className="text-white/50 text-sm mt-1">Everything disappears by 5am</p>
          </div>
          <button 
            onClick={openCheckIn} 
            className="text-5xl font-bold text-[#d4ff00] hover:scale-110 transition-transform"
          >
            S
          </button>
        </div>

        {/* Divider line */}
        <div className="mx-6 h-px bg-white/20" />

        {/* Friends Story Row */}
        {friends.length > 0 && (
          <div className="px-6 py-4">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide">
              {friends.map((friend) => (
                <button 
                  key={friend.user_id} 
                  onClick={() => openFriendCard(friend.user_id)}
                  className="flex-shrink-0"
                >
                  <Avatar className="h-16 w-16 border-[3px] border-[#d4ff00] ring-2 ring-[#d4ff00]/30 cursor-pointer hover:scale-105 transition-transform">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#1a0f2e] text-white">
                      {friend.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Posts Feed */}
      <div className="px-4 py-6 space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/60">No posts yet from friends</p>
            <p className="text-white/40 text-sm mt-2">Posts disappear by 5am</p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-[#1a0f2e]/80 backdrop-blur rounded-2xl overflow-hidden"
            >
              {/* Post Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <button 
                  onClick={() => openFriendCard(post.user_id)}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <Avatar className="h-12 w-12 cursor-pointer">
                    <AvatarImage src={post.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#2d1b4e] text-white">
                      {post.profiles?.display_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="font-semibold text-white text-base">{post.profiles?.display_name}</p>
                    {post.venue_name && (
                      <p className="text-[#d4ff00] font-medium text-sm">{post.venue_name}</p>
                    )}
                  </div>
                </button>
                <span className="text-white/50 text-sm">{getTimeAgo(post.created_at)}</span>
              </div>

              {/* Post Image */}
              {post.image_url && (
                <div className="px-4 pb-4">
                  <div className="w-full aspect-square rounded-2xl overflow-hidden">
                    <img
                      src={post.image_url}
                      alt="Post"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Post Actions */}
              <div className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-5">
                  <button className="flex items-center gap-2 text-white hover:text-[#d4ff00] transition-colors">
                    <Heart className="h-7 w-7" />
                    <span className="font-semibold text-base">5</span>
                  </button>
                  <button className="flex items-center gap-2 text-white hover:text-[#d4ff00] transition-colors">
                    <MessageCircle className="h-7 w-7" />
                    <span className="font-semibold text-base">4</span>
                  </button>
                  <button className="text-white hover:text-[#d4ff00] transition-colors ml-auto">
                    <Send className="h-7 w-7" />
                  </button>
                </div>

                {/* Liked By */}
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {friends.slice(0, 3).map((friend, idx) => (
                      <Avatar key={idx} className="h-6 w-6 border-2 border-[#1a0f2e]">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <p className="text-white text-sm">
                    Liked by <span className="font-semibold">janelovespotted</span> and others
                  </p>
                </div>

                {/* Caption */}
                <div className="text-white/90 text-sm leading-relaxed">
                  <span className="font-semibold text-white">{post.profiles?.username}</span>{' '}
                  {post.text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Create Post Button */}
      <button
        onClick={() => setShowCreatePost(true)}
        className="fixed bottom-24 right-6 z-20 h-14 w-14 rounded-full bg-[#d4ff00] shadow-[0_0_30px_rgba(212,255,0,0.8)] hover:scale-110 transition-transform flex items-center justify-center"
      >
        <Plus className="h-7 w-7 text-[#1a0f2e]" />
      </button>

      {/* Create Post Dialog */}
      <CreatePostDialog open={showCreatePost} onOpenChange={setShowCreatePost} />
    </div>
  );
}
