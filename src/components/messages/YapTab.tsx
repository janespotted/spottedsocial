import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface YapMessage {
  id: string;
  text: string;
  created_at: string;
  is_anonymous: boolean;
  venue_name: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  } | null;
  score: number;
  user_vote: 'up' | 'down' | null;
}

export function YapTab() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<YapMessage[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string>('');
  const [sortBy, setSortBy] = useState<'new' | 'hot'>('new');

  useEffect(() => {
    if (user) {
      fetchUserVenue();
    }
  }, [user]);

  useEffect(() => {
    if (selectedVenue) {
      fetchYapMessages();
    }
  }, [selectedVenue, sortBy]);

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
    const { data } = await supabase
      .from('yap_messages')
      .select(`
        *,
        profiles:user_id (
          display_name,
          avatar_url
        )
      `)
      .eq('venue_name', selectedVenue)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      const messagesWithScores = data.map(msg => ({
        ...msg,
        score: Math.floor(Math.random() * 100), // Mock score
        user_vote: null as 'up' | 'down' | null,
      }));

      if (sortBy === 'hot') {
        messagesWithScores.sort((a, b) => b.score - a.score);
      }

      setMessages(messagesWithScores);
    }
  };

  const getTimeAgo = (date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    return distance.replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h');
  };

  return (
    <div className="space-y-4">
      {/* Venue Header */}
      {selectedVenue ? (
        <>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#d4ff00]">@{selectedVenue}</h2>
          </div>

          {/* Sort Tabs */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setSortBy('new')}
              className={cn(
                'px-6 py-2 rounded-full border-2 transition-colors',
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
                'px-6 py-2 rounded-full border-2 transition-colors',
                sortBy === 'hot'
                  ? 'border-white text-white bg-white/10'
                  : 'border-white/20 text-white/60'
              )}
            >
              Hot
            </button>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4"
              >
                <div className="flex gap-3">
                  {/* Avatar or Anonymous Icon */}
                  <div className="flex-shrink-0">
                    {msg.is_anonymous ? (
                      <div className="w-10 h-10 rounded-full bg-[#1a0f2e] border-2 border-[#a855f7] flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-[#a855f7]/40" />
                      </div>
                    ) : (
                      <Avatar className="h-10 w-10 border-2 border-[#a855f7]">
                        <AvatarImage src={msg.profiles?.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                          {msg.profiles?.display_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {msg.is_anonymous ? 'User' + msg.id.slice(0, 6) : msg.profiles?.display_name}
                      </span>
                      <span className="text-white/40 text-sm">{getTimeAgo(msg.created_at)}</span>
                    </div>
                    <p className="text-white/90 mt-1">{msg.text}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-white/60 text-sm">
                        <MessageCircle className="h-4 w-4" />
                        <span>9</span>
                      </div>
                    </div>
                  </div>

                  {/* Vote Controls */}
                  <div className="flex flex-col items-center gap-1">
                    <button className="text-white/40 hover:text-[#d4ff00] transition-colors">
                      <ChevronUp className="h-5 w-5" />
                    </button>
                    <span className={cn(
                      'font-bold text-sm',
                      msg.score > 50 ? 'text-[#d4ff00]' : 
                      msg.score > 20 ? 'text-white' : 
                      'text-white/60'
                    )}>
                      {msg.score}
                    </span>
                    <button className="text-white/40 hover:text-[#a855f7] transition-colors">
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
          <p className="text-white/60">Check in to a venue to see yaps</p>
        </div>
      )}
    </div>
  );
}
