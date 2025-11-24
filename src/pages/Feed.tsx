import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function Feed() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<any[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPosts();
      subscribeToNewPosts();
    }
  }, [user]);

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

  const calculateExpiryTime = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return tomorrow.toISOString();
  };

  const handlePost = async () => {
    if (!newPost.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('posts').insert({
        user_id: user?.id,
        text: newPost,
        expires_at: calculateExpiryTime(),
      });

      if (error) throw error;

      setNewPost('');
      toast({
        title: 'Posted!',
        description: 'Your post will disappear by 5 AM.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Newsfeed</h1>
      <Card className="p-4 bg-accent/5 border-accent/20">
        <p className="text-sm text-muted-foreground text-center">
          ⚡ Everything here disappears by 5 AM
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <Textarea
          placeholder="What's happening tonight?"
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          className="resize-none"
          rows={3}
        />
        <Button
          onClick={handlePost}
          disabled={loading || !newPost.trim()}
          className="w-full"
        >
          {loading ? 'Posting...' : 'Post'}
        </Button>
      </Card>

      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Avatar>
                <AvatarFallback>{post.profiles?.display_name?.[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{post.profiles?.display_name}</p>
                    <p className="text-sm text-muted-foreground">
                      @{post.profiles?.username}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-2">{post.text}</p>
                {post.venue_name && (
                  <p className="text-sm text-primary mt-2">📍 {post.venue_name}</p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
