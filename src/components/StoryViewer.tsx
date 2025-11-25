import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  created_at: string;
  venue_name: string | null;
  profiles: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

interface StoryViewerProps {
  userId: string;
  onClose: () => void;
  allStoryUsers: string[];
  currentUserIndex: number;
}

export function StoryViewer({ userId, onClose, allStoryUsers, currentUserIndex }: StoryViewerProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [userIndex, setUserIndex] = useState(currentUserIndex);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStories(allStoryUsers[userIndex]);
  }, [userIndex]);

  useEffect(() => {
    if (stories.length === 0) return;

    const currentStory = stories[currentStoryIndex];
    markAsViewed(currentStory.id);

    const duration = currentStory.media_type === 'video' ? 15000 : 5000;
    const interval = 50;
    const increment = (interval / duration) * 100;

    setProgress(0);
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + increment;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currentStoryIndex, stories]);

  const fetchStories = async (targetUserId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('stories')
      .select(`
        *,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('user_id', targetUserId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    setStories((data as Story[]) || []);
    setCurrentStoryIndex(0);
    setProgress(0);
    setLoading(false);
  };

  const markAsViewed = async (storyId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('story_views')
      .upsert({ story_id: storyId, user_id: user.id }, { onConflict: 'story_id,user_id' });
  };

  const handleNext = () => {
    if (currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(prev => prev + 1);
    } else if (userIndex < allStoryUsers.length - 1) {
      setUserIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
    } else if (userIndex > 0) {
      setUserIndex(prev => prev - 1);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || sending) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const storyAuthorId = currentStory.user_id;
      
      // Find or create thread
      const { data: existingThreads } = await supabase
        .from('dm_thread_members')
        .select('thread_id')
        .eq('user_id', user.id);

      let threadId: string | null = null;

      if (existingThreads && existingThreads.length > 0) {
        for (const t of existingThreads) {
          const { data: members } = await supabase
            .from('dm_thread_members')
            .select('user_id')
            .eq('thread_id', t.thread_id);

          if (members && members.length === 2 && members.some(m => m.user_id === storyAuthorId)) {
            threadId = t.thread_id;
            break;
          }
        }
      }

      if (!threadId) {
        const { data: newThread } = await supabase
          .from('dm_threads')
          .insert({})
          .select()
          .single();

        if (newThread) {
          threadId = newThread.id;
          await supabase.from('dm_thread_members').insert([
            { thread_id: threadId, user_id: user.id },
            { thread_id: threadId, user_id: storyAuthorId }
          ]);
        }
      }

      if (threadId) {
        const contextMessage = currentStory.venue_name 
          ? `Replied to your story at ${currentStory.venue_name}: ${replyText}`
          : `Replied to your story: ${replyText}`;

        await supabase.from('dm_messages').insert({
          thread_id: threadId,
          sender_id: user.id,
          text: contextMessage
        });

        toast.success('Reply sent!');
        onClose();
        navigate(`/messages/thread/${threadId}`);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (loading || stories.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const currentStory = stories[currentStoryIndex];

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-full bg-black z-[60] flex items-center justify-center overflow-hidden">
      {/* Progress bars */}
      <div className="absolute top-4 left-0 right-0 flex gap-1 px-4 z-10 max-w-full">
        {stories.map((_, idx) => (
          <div key={idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100"
              style={{
                width: idx < currentStoryIndex ? '100%' : idx === currentStoryIndex ? `${progress}%` : '0%'
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-8 left-0 right-0 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-white">
            <AvatarImage src={currentStory.profiles?.avatar_url || undefined} />
            <AvatarFallback className="bg-[#1a0f2e] text-white">
              {currentStory.profiles?.display_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-white">{currentStory.profiles?.display_name}</p>
            {currentStory.venue_name && (
              <p className="text-white/90 text-sm">@ {currentStory.venue_name}</p>
            )}
            <p className="text-white/60 text-xs">
              {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Story content */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {currentStory.media_type === 'image' ? (
          <img
            src={currentStory.media_url}
            alt="Story"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            src={currentStory.media_url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            playsInline
          />
        )}

        {/* Navigation areas */}
        <button
          onClick={handlePrevious}
          className="absolute left-0 top-0 bottom-0 w-1/3 flex items-center justify-start pl-4 group"
        >
          <ChevronLeft className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleNext}
          className="absolute right-0 top-0 bottom-0 w-1/3 flex items-center justify-end pr-4 group"
        >
          <ChevronRight className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      {/* Reply input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <Input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReply()}
            placeholder="Send a message..."
            className="flex-1 bg-white/20 border-white/30 text-white placeholder:text-white/60"
            disabled={sending}
          />
          <button
            onClick={handleReply}
            disabled={!replyText.trim() || sending}
            className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
