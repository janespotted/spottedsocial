import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, ChevronUp, ChevronDown, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface YapMessage {
  id: string;
  text: string;
  created_at: string;
  is_anonymous: boolean;
  venue_name: string;
  author_handle: string | null;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  } | null;
  score: number;
  comments_count: number;
  user_vote: 'up' | 'down' | null;
}

export function YapTab() {
  const { user } = useAuth();
  const demoMode = useDemoMode();
  const [messages, setMessages] = useState<YapMessage[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string>('');
  const [sortBy, setSortBy] = useState<'new' | 'hot'>('new');
  const [newYap, setNewYap] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserVenue();
    }
  }, [user]);

  useEffect(() => {
    if (selectedVenue) {
      fetchYapMessages();
      const cleanup = subscribeToYaps();
      return cleanup;
    }
  }, [selectedVenue, sortBy, demoMode]);

  const fetchUserVenue = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('venue_name')
      .eq('user_id', user?.id)
      .not('venue_name', 'is', null)
      .maybeSingle();

    if (data?.venue_name) {
      setSelectedVenue(data.venue_name);
    }
  };

  const fetchYapMessages = async () => {
    if (!user) return;

    // Fetch yap messages with vote information
    let query = supabase
      .from('yap_messages')
      .select(`
        *,
        profiles:user_id (
          display_name,
          avatar_url
        )
      `)
      .gt('expires_at', new Date().toISOString());

    // In demo mode, show all demo yaps OR yaps for current venue
    // In normal mode, only show yaps for current venue (non-demo)
    if (demoMode) {
      query = query.or(`venue_name.eq.${selectedVenue},is_demo.eq.true`);
    } else {
      query = query.eq('venue_name', selectedVenue).eq('is_demo', false);
    }

    const { data: yaps } = await query;

    if (!yaps) return;

    // Fetch user's votes for these yaps
    const yapIds = yaps.map(y => y.id);
    const { data: votes } = await supabase
      .from('yap_votes')
      .select('yap_id, vote_type')
      .eq('user_id', user.id)
      .in('yap_id', yapIds);

    const voteMap = new Map(votes?.map(v => [v.yap_id, v.vote_type as 'up' | 'down']) || []);

    const messagesWithVotes = yaps.map(msg => ({
      ...msg,
      user_vote: voteMap.get(msg.id) || null,
    }));

    // Sort based on selected tab
    if (sortBy === 'hot') {
      messagesWithVotes.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      messagesWithVotes.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    setMessages(messagesWithVotes);
  };

  const subscribeToYaps = () => {
    const channel = supabase
      .channel('yap-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'yap_messages',
          filter: `venue_name=eq.${selectedVenue}`,
        },
        () => {
          fetchYapMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleVote = async (yapId: string, voteType: 'up' | 'down') => {
    if (!user) return;

    const currentMessage = messages.find(m => m.id === yapId);
    if (!currentMessage) return;

    const existingVote = currentMessage.user_vote;
    let scoreDelta = 0;

    // Calculate score change
    if (existingVote === voteType) {
      // Remove vote
      scoreDelta = voteType === 'up' ? -1 : 1;
      await supabase
        .from('yap_votes')
        .delete()
        .eq('yap_id', yapId)
        .eq('user_id', user.id);
    } else if (existingVote) {
      // Change vote
      scoreDelta = voteType === 'up' ? 2 : -2;
      await supabase
        .from('yap_votes')
        .update({ vote_type: voteType })
        .eq('yap_id', yapId)
        .eq('user_id', user.id);
    } else {
      // New vote
      scoreDelta = voteType === 'up' ? 1 : -1;
      await supabase
        .from('yap_votes')
        .insert({ yap_id: yapId, user_id: user.id, vote_type: voteType });
    }

    // Update score in database
    await supabase
      .from('yap_messages')
      .update({ score: currentMessage.score + scoreDelta })
      .eq('id', yapId);

    // Update local state
    setMessages(prev => prev.map(m => 
      m.id === yapId 
        ? { 
            ...m, 
            score: m.score + scoreDelta,
            user_vote: existingVote === voteType ? null : voteType 
          }
        : m
    ));
  };

  const handlePostYap = async () => {
    if (!user || !newYap.trim() || !selectedVenue) return;

    setIsPosting(true);
    try {
      // Generate anonymous handle (User + 6 random digits)
      const handle = `User${Math.floor(100000 + Math.random() * 900000)}`;
      
      // Set expiry to 5am next day
      const now = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + 1);
      expiry.setHours(5, 0, 0, 0);
      if (now.getHours() >= 5) {
        // If it's already past 5am today, set to 5am tomorrow
        expiry.setDate(expiry.getDate() + 1);
      }

      const { error } = await supabase
        .from('yap_messages')
        .insert({
          user_id: user.id,
          text: newYap.trim(),
          venue_name: selectedVenue,
          is_anonymous: true,
          author_handle: handle,
          score: 0,
          comments_count: 0,
          expires_at: expiry.toISOString(),
        });

      if (error) throw error;

      setNewYap('');
      toast.success('Yap posted!');
      fetchYapMessages();
    } catch (error) {
      console.error('Error posting yap:', error);
      toast.error('Failed to post yap');
    } finally {
      setIsPosting(false);
    }
  };

  const getTimeAgo = (date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    return distance.replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h');
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Venue Header */}
      {selectedVenue ? (
        <>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#d4ff00]">@{selectedVenue}</h2>
          </div>

          {/* Sort Tabs */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setSortBy('new')}
              className={cn(
                'px-8 py-2 rounded-full border-2 transition-colors font-semibold',
                sortBy === 'new'
                  ? 'border-[#d4ff00] text-[#d4ff00] bg-[#d4ff00]/10'
                  : 'border-white/20 text-white/60'
              )}
            >
              New
            </button>
            <button
              onClick={() => setSortBy('hot')}
              className={cn(
                'px-8 py-2 rounded-full border-2 transition-colors font-semibold',
                sortBy === 'hot'
                  ? 'border-white text-white bg-white/10'
                  : 'border-white/20 text-white/60'
              )}
            >
              Hot
            </button>
          </div>

          {/* Post Input */}
          <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
            <Textarea
              value={newYap}
              onChange={(e) => setNewYap(e.target.value)}
              placeholder="What's happening at the venue? (anonymous)"
              className="bg-[#1a0f2e] border-[#a855f7]/20 text-white placeholder:text-white/40 resize-none"
              rows={3}
              maxLength={280}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-white/40 text-sm">{newYap.length}/280</span>
              <Button
                onClick={handlePostYap}
                disabled={!newYap.trim() || isPosting}
                className="bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
              >
                <Send className="h-4 w-4 mr-2" />
                Post
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4"
              >
                <div className="flex gap-3">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">
                        {msg.author_handle || `User${msg.id.slice(0, 6)}`}
                      </span>
                      <span className="text-white/40 text-sm">{getTimeAgo(msg.created_at)}</span>
                    </div>
                    <p className="text-white/90 mt-1 text-[15px]">{msg.text}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-white/60 text-sm">
                        <MessageCircle className="h-4 w-4" />
                        <span>{msg.comments_count}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vote Controls */}
                  <div className="flex flex-col items-center gap-1">
                    <button 
                      onClick={() => handleVote(msg.id, 'up')}
                      className={cn(
                        'transition-colors',
                        msg.user_vote === 'up' 
                          ? 'text-[#d4ff00]' 
                          : 'text-white/40 hover:text-[#d4ff00]'
                      )}
                    >
                      <ChevronUp className="h-5 w-5" />
                    </button>
                    <span className={cn(
                      'font-bold text-sm',
                      msg.score > 50 ? 'text-[#d4ff00]' : 
                      msg.score > 20 ? 'text-white' : 
                      msg.score < 0 ? 'text-red-400' :
                      'text-white/60'
                    )}>
                      {msg.score}
                    </span>
                    <button 
                      onClick={() => handleVote(msg.id, 'down')}
                      className={cn(
                        'transition-colors',
                        msg.user_vote === 'down' 
                          ? 'text-[#a855f7]' 
                          : 'text-white/40 hover:text-[#a855f7]'
                      )}
                    >
                      <ChevronDown className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-white/60">No yaps yet at {selectedVenue}</p>
                <p className="text-white/40 text-sm mt-2">Be the first to start the conversation</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <MessageCircle className="h-16 w-16 mx-auto text-white/20 mb-4" />
          <p className="text-white/60 font-semibold">Yap is only available when you're at a venue</p>
          <p className="text-white/40 text-sm mt-2">Check in to join the conversation</p>
        </div>
      )}
    </div>
  );
}
