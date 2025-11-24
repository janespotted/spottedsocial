import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

export default function Home() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [hasCheckedToday, setHasCheckedToday] = useState(false);

  useEffect(() => {
    if (user) {
      checkFirstLogin();
      fetchFriends();
      fetchPosts();
      subscribeToNewPosts();
    }
  }, [user]);

  const checkFirstLogin = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('updated_at')
      .eq('user_id', user?.id)
      .maybeSingle();

    if (!data) {
      openCheckIn();
      setHasCheckedToday(false);
    } else {
      const lastUpdate = new Date(data.updated_at);
      const today = new Date();
      const isToday = lastUpdate.toDateString() === today.toDateString();
      setHasCheckedToday(isToday);
      
      if (!isToday) {
        openCheckIn();
      }
    }
  };

  const fetchFriends = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    if (friendships && friendships.length > 0) {
      const friendIds = friendships.map(f => f.friend_id);
      
      const { data: friendProfiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', friendIds);

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

    const { data } = await supabase
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
    return distance.replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h')
      .replace(' days', 'd').replace(' day', 'd');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-light tracking-[0.3em] text-white mb-1">Spotted</h1>
            <h2 className="text-3xl font-bold text-white">Newsfeed</h2>
            <p className="text-white/60 text-sm mt-1">Everything disappears by 5am</p>
          </div>
          <button 
            onClick={openCheckIn}
            className="text-4xl font-bold text-[#d4ff00] hover:scale-110 transition-transform"
          >
            S
          </button>
        </div>

        {/* Friends Story Row */}
        {friends.length > 0 && (
          <div className="px-6 pb-4">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide">
              {friends.map((friend) => (
                <div key={friend.user_id} className="flex-shrink-0">
                  <Avatar className="h-16 w-16 border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.8)]">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#1a0f2e] text-white">
                      {friend.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                </div>
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
              className="bg-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.4)]"
            >
              {/* Post Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                    <AvatarImage src={post.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#1a0f2e] text-white">
                      {post.profiles?.display_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-white">{post.profiles?.display_name}</p>
                    {post.venue_name && (
                      <p className="text-[#d4ff00] font-medium text-sm">{post.venue_name}</p>
                    )}
                  </div>
                </div>
                <span className="text-white/60 text-sm">{getTimeAgo(post.created_at)}</span>
              </div>

              {/* Post Image */}
              {post.image_url && (
                <div className="w-full aspect-square">
                  <img
                    src={post.image_url}
                    alt="Post"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Post Actions */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <button className="flex items-center gap-2 text-white hover:text-[#d4ff00] transition-colors">
                    <Heart className="h-6 w-6" />
                    <span className="font-semibold">5</span>
                  </button>
                  <button className="flex items-center gap-2 text-white hover:text-[#d4ff00] transition-colors">
                    <MessageCircle className="h-6 w-6" />
                    <span className="font-semibold">4</span>
                  </button>
                  <button className="text-white hover:text-[#d4ff00] transition-colors ml-auto">
                    <Send className="h-6 w-6" />
                  </button>
                </div>

                {/* Liked By */}
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {friends.slice(0, 3).map((friend, idx) => (
                      <Avatar key={idx} className="h-6 w-6 border-2 border-[#0a0118]">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <p className="text-white/80 text-sm">
                    Liked by <span className="font-semibold">janelovespotted</span> and others
                  </p>
                </div>

                {/* Caption */}
                <div className="text-white/90 text-sm">
                  <span className="font-semibold">{post.profiles?.username}</span>{' '}
                  {post.text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
