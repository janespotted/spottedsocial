import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Camera, Send, Image } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface Message {
  id: string;
  text: string;
  sender_id: string;
  created_at: string;
  image_url?: string | null;
}

interface ThreadMember {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  venue_name: string | null;
  venue_id: string | null;
}

export default function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherMember, setOtherMember] = useState<ThreadMember | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !threadId) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      // Store images in thread folder for RLS policy matching
      const fileName = `${threadId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('dm-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Store the file path (not public URL) since bucket is now private
      await supabase.from('dm_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        text: '',
        image_url: fileName, // Store path for signed URL generation
      });

      toast.success('Image sent!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to send image');
    } finally {
      setIsUploading(false);
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  const handleVenueClick = async (venueName: string, venueId?: string | null) => {
    if (venueId) {
      openVenueCard(venueId);
      return;
    }

    // If no venue_id, look it up by name
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();

    if (data?.id) {
      openVenueCard(data.id);
    }
  };

  useEffect(() => {
    if (threadId && user) {
      fetchThreadData();
      fetchMessages();
      const cleanup = subscribeToMessages();
      return cleanup;
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
        .select('venue_name, venue_id')
        .eq('user_id', member.user_id)
        .maybeSingle();

      setOtherMember({
        user_id: member.user_id,
        ...member.profiles,
        venue_name: status?.venue_name || null,
        venue_id: status?.venue_id || null,
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
      // Generate signed URLs for messages with images
      const messagesWithSignedUrls = await Promise.all(
        data.map(async (msg) => {
          if (msg.image_url && !msg.image_url.startsWith('http')) {
            // It's a file path, generate signed URL
            const { data: signedData } = await supabase.storage
              .from('dm-images')
              .createSignedUrl(msg.image_url, 3600); // 1 hour expiry
            return { ...msg, image_url: signedData?.signedUrl || null };
          }
          return msg;
        })
      );
      setMessages(messagesWithSignedUrls);
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
        async (payload) => {
          const newMsg = payload.new as Message;
          // Generate signed URL for new image messages
          if (newMsg.image_url && !newMsg.image_url.startsWith('http')) {
            const { data: signedData } = await supabase.storage
              .from('dm-images')
              .createSignedUrl(newMsg.image_url, 3600);
            newMsg.image_url = signedData?.signedUrl || null;
          }
          setMessages((prev) => [...prev, newMsg]);
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
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-4">
          <button 
            onClick={() => navigate('/messages')}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button 
            onClick={() => otherMember && openFriendCard({
              userId: otherMember.user_id,
              displayName: otherMember.display_name,
              avatarUrl: otherMember.avatar_url,
              venueName: otherMember.venue_name || undefined,
            })}
            className="flex items-center gap-3 flex-1 mx-4 hover:opacity-80 transition-opacity"
          >
            <Avatar className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)] cursor-pointer">
              <AvatarImage src={otherMember?.avatar_url || undefined} />
              <AvatarFallback className="bg-[#1a0f2e] text-white">
                {otherMember?.display_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <h2 className="font-semibold text-white truncate">{otherMember?.display_name}</h2>
              <p className="text-white/60 text-sm truncate">{otherMember?.username}</p>
            </div>
            {otherMember?.venue_name && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleVenueClick(otherMember.venue_name!, otherMember.venue_id);
                }}
                className="text-[#d4ff00] text-sm font-medium hover:text-[#d4ff00]/80 transition-colors"
              >
                @{otherMember.venue_name}
              </button>
            )}
          </button>

          <button 
            onClick={openCheckIn}
            className="hover:scale-110 transition-transform"
          >
            <img src={spottedLogo} alt="Check In" className="h-12 w-12 object-contain" />
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
                    className={`max-w-[75%] rounded-2xl overflow-hidden ${
                      isCurrentUser
                        ? 'bg-[#4c2f6e] text-white rounded-br-sm'
                        : 'bg-white/95 text-[#1a0f2e] rounded-bl-sm'
                    }`}
                  >
                    {message.image_url && (
                      <img 
                        src={message.image_url} 
                        alt="Shared image" 
                        className="w-full max-w-[250px] rounded-t-2xl"
                      />
                    )}
                    {message.text && (
                      <p className="text-sm leading-relaxed px-4 py-2.5">{message.text}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-[#1a0f2e]/95 backdrop-blur border-t border-[#a855f7]/20 p-4">
        <input
          type="file"
          ref={cameraInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          capture="environment"
          className="hidden"
        />
        <input
          type="file"
          ref={galleryInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />
        <form onSubmit={sendMessage} className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={isUploading}
                className="text-white/60 hover:text-white hover:bg-[#2d1b4e]"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#1a0f2e] border-[#a855f7]/40">
              <DropdownMenuItem 
                onClick={() => cameraInputRef.current?.click()}
                className="text-white hover:bg-[#2d1b4e] cursor-pointer"
              >
                <Camera className="mr-2 h-4 w-4" />
                Camera
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => galleryInputRef.current?.click()}
                className="text-white hover:bg-[#2d1b4e] cursor-pointer"
              >
                <Image className="mr-2 h-4 w-4" />
                Upload from camera roll
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-full"
          />

            <Button
              type="submit"
              size="icon"
              disabled={!newMessage.trim()}
              className="bg-[#a855f7] hover:bg-[#9333ea] text-white shadow-[0_0_10px_rgba(168,85,247,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </Button>
        </form>
      </div>
    </div>
  </div>
  );
}
