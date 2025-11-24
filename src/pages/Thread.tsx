import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Camera, Mic } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  text: string;
  sender_id: string;
  created_at: string;
}

interface ThreadMember {
  display_name: string;
  username: string;
  avatar_url: string | null;
  venue_name: string | null;
}

export default function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherMember, setOtherMember] = useState<ThreadMember | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadId && user) {
      fetchThreadData();
      fetchMessages();
      subscribeToMessages();
    }
  }, [threadId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchThreadData = async () => {
    // Get other member info
    const { data: members } = await supabase
      .from('dm_thread_members')
      .select(`
        user_id,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('thread_id', threadId)
      .neq('user_id', user?.id);

    if (members && members.length > 0) {
      const member = members[0];
      
      // Get their venue
      const { data: status } = await supabase
        .from('night_statuses')
        .select('venue_name')
        .eq('user_id', member.user_id)
        .maybeSingle();

      setOtherMember({
        ...member.profiles,
        venue_name: status?.venue_name || null,
      });
    }
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`thread_${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    await supabase.from('dm_messages').insert({
      thread_id: threadId,
      sender_id: user.id,
      text: newMessage.trim(),
    });

    setNewMessage('');
  };

  const getTimeAgo = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
      .replace('about ', '')
      .replace(' ago', '');
  };

  const groupMessages = () => {
    const grouped: { timestamp: string; messages: Message[] }[] = [];
    let currentGroup: Message[] = [];
    let lastTimestamp = '';

    messages.forEach((msg, index) => {
      const msgTime = new Date(msg.created_at);
      const timeStr = msgTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase();

      if (index === 0 || Math.abs(msgTime.getTime() - new Date(messages[index - 1].created_at).getTime()) > 5 * 60 * 1000) {
        if (currentGroup.length > 0) {
          grouped.push({ timestamp: lastTimestamp, messages: currentGroup });
        }
        currentGroup = [msg];
        lastTimestamp = timeStr;
      } else {
        currentGroup.push(msg);
      }
    });

    if (currentGroup.length > 0) {
      grouped.push({ timestamp: lastTimestamp, messages: currentGroup });
    }

    return grouped;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-4">
          <button 
            onClick={() => navigate('/messages')}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="flex items-center gap-3 flex-1 mx-4">
            <Avatar className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
              <AvatarImage src={otherMember?.avatar_url || undefined} />
              <AvatarFallback className="bg-[#1a0f2e] text-white">
                {otherMember?.display_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-white truncate">{otherMember?.display_name}</h2>
              <p className="text-white/60 text-sm truncate">{otherMember?.username}</p>
            </div>
            {otherMember?.venue_name && (
              <div className="text-[#d4ff00] text-sm font-medium">
                @{otherMember.venue_name}
              </div>
            )}
          </div>

          <button 
            onClick={openCheckIn}
            className="text-2xl font-bold text-[#d4ff00] hover:scale-110 transition-transform"
          >
            S
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {groupMessages().map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-3">
            {/* Timestamp */}
            <div className="flex justify-center">
              <span className="text-white/40 text-xs">{group.timestamp}</span>
            </div>

            {/* Messages in group */}
            {group.messages.map((message) => {
              const isCurrentUser = message.sender_id === user?.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isCurrentUser && (
                    <Avatar className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_10px_rgba(168,85,247,0.4)]">
                      <AvatarImage src={otherMember?.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {otherMember?.display_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                      isCurrentUser
                        ? 'bg-[#4c2f6e] text-white rounded-br-sm'
                        : 'bg-white/95 text-[#1a0f2e] rounded-bl-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{message.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-20 bg-[#1a0f2e]/95 backdrop-blur border-t border-[#a855f7]/20 p-4">
        <form onSubmit={sendMessage} className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-white/60 hover:text-white hover:bg-[#2d1b4e]"
          >
            <Camera className="h-5 w-5" />
          </Button>

          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full"
          />

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-white/60 hover:text-white hover:bg-[#2d1b4e]"
          >
            <Mic className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
