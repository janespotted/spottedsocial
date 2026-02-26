import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft, Users, ChevronDown, UserPlus, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { z } from 'zod';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { logger } from '@/lib/logger';
import { MessageInput } from '@/components/MessageInput';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

// Validation schema for DM messages
const messageSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long (max 2000 characters)')
});

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

interface GroupInfo {
  is_group: boolean;
  name: string | null;
  members: ThreadMember[];
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
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showMembersPopover, setShowMembersPopover] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Map sender_id to member info for group chats
  const [memberMap, setMemberMap] = useState<Map<string, ThreadMember>>(new Map());

  // Typing indicator
  const { typingUsers, setTyping } = useTypingIndicator(threadId, user?.id, memberMap);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!user || !threadId) return;

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

      logger.info('dm:image_upload', { threadId });
      toast.success('Image sent!');
    } catch (error) {
      logger.apiError('dm:image_upload', error);
      toast.error('Failed to send image');
    } finally {
      setIsUploading(false);
    }
  }, [user, threadId]);

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
      fetchCurrentUserProfile();
      const cleanup = subscribeToMessages();
      return cleanup;
    }
  }, [threadId, user]);

  const fetchCurrentUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single();
    if (data) {
      setCurrentUserProfile(data);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchThreadData = async () => {
    // Get thread info (is_group, name)
    const { data: threadData } = await supabase
      .from('dm_threads')
      .select('is_group, name')
      .eq('id', threadId)
      .single();

    const isGroup = threadData?.is_group || false;

    // Get all other members info
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
      // Build member map for message sender lookup
      const newMemberMap = new Map<string, ThreadMember>();
      const allMembers: ThreadMember[] = [];

      for (const member of members) {
        // Get their venue
        const { data: status } = await supabase
          .from('night_statuses')
          .select('venue_name, venue_id')
          .eq('user_id', member.user_id)
          .maybeSingle();

        const memberData: ThreadMember = {
          user_id: member.user_id,
          display_name: (member.profiles as any)?.display_name || 'Unknown',
          username: (member.profiles as any)?.username || '',
          avatar_url: (member.profiles as any)?.avatar_url || null,
          venue_name: status?.venue_name || null,
          venue_id: status?.venue_id || null,
        };

        newMemberMap.set(member.user_id, memberData);
        allMembers.push(memberData);
      }

      setMemberMap(newMemberMap);

      if (isGroup) {
        setGroupInfo({
          is_group: true,
          name: threadData?.name || null,
          members: allMembers,
        });
        setOtherMember(null);
      } else {
        setGroupInfo(null);
        setOtherMember(allMembers[0]);
      }
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

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !user) return;

    // Validate message with Zod
    const validation = messageSchema.safeParse({ text });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    const { error } = await supabase.from('dm_messages').insert({
      thread_id: threadId,
      sender_id: user.id,
      text: validation.data.text,
    });

    if (error) {
      logger.apiError('dm:send', error);
      toast.error('Failed to send message');
      return;
    }

    logger.dm(threadId!, otherMember?.user_id || 'unknown');
  }, [user, threadId, otherMember]);

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

  const getGroupDisplayName = (): string => {
    if (!groupInfo) return '';
    if (groupInfo.name) return groupInfo.name;
    const names = groupInfo.members.map(m => m.display_name.split(' ')[0]);
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} & ${names.length - 2} others`;
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

            {groupInfo ? (
              // Group chat header with dropdown
              <Popover open={showMembersPopover} onOpenChange={setShowMembersPopover}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-3 flex-1 mx-4 hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-[#1a0f2e] border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)] flex items-center justify-center overflow-hidden">
                      {groupInfo.members.length <= 4 ? (
                        <div className="grid grid-cols-2 gap-0.5 w-full h-full p-0.5">
                          {groupInfo.members.slice(0, 4).map((member) => (
                            <Avatar key={member.user_id} className="w-full h-full rounded-sm">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-[8px] rounded-sm">
                                {member.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      ) : (
                        <Users className="h-5 w-5 text-[#a855f7]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1">
                        <h2 className="font-semibold text-white truncate">{getGroupDisplayName()}</h2>
                        <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${showMembersPopover ? 'rotate-180' : ''}`} />
                      </div>
                      <p className="text-white/60 text-sm truncate">{groupInfo.members.length + 1} members</p>
                    </div>
                  </button>
                </PopoverTrigger>
                
                <PopoverContent 
                  align="start" 
                  sideOffset={8}
                  className="bg-[#1a0f2e] border-[#a855f7]/40 shadow-[0_0_25px_rgba(168,85,247,0.4)] p-0 w-64"
                >
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-[#a855f7]/20">
                    <p className="text-white/70 text-sm font-medium">Group Members</p>
                  </div>
                  
                  {/* Members List */}
                  <div className="max-h-60 overflow-y-auto">
                    {/* Current user (you) */}
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar className="h-8 w-8 border border-[#a855f7]/40">
                        <AvatarImage src={currentUserProfile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
                          {currentUserProfile?.display_name?.[0] || 'Y'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white text-sm">You</span>
                    </div>
                    
                    {/* Other members */}
                    {groupInfo.members.map((member) => (
                      <button
                        key={member.user_id}
                        onClick={() => {
                          setShowMembersPopover(false);
                          openFriendCard({
                            userId: member.user_id,
                            displayName: member.display_name,
                            avatarUrl: member.avatar_url,
                            venueName: member.venue_name || undefined,
                          });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#a855f7]/15 transition-colors"
                      >
                        <Avatar className="h-8 w-8 border border-[#a855f7]/40">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#2d1b4e] text-white text-sm">
                            {member.display_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-white text-sm truncate block">{member.display_name}</span>
                          {member.venue_name && (
                            <span className="text-[#d4ff00] text-xs truncate block">@{member.venue_name}</span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/40" />
                      </button>
                    ))}
                  </div>
                  
                  {/* Add People Button */}
                  <div className="border-t border-[#a855f7]/20 p-2">
                    <button
                      onClick={() => {
                        setShowMembersPopover(false);
                        toast.info('Add members feature coming soon!');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#a855f7]/15 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                        <UserPlus className="w-4 h-4 text-[#a855f7]" />
                      </div>
                      <span className="text-[#a855f7] text-sm font-medium">Add People</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              // 1:1 chat header
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
                  <p className="text-white/60 text-sm truncate">@{otherMember?.username}</p>
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
            )}

            <button 
              onClick={openCheckIn}
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Go live" className="h-12 w-12 object-contain" />
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
              const sender = !isCurrentUser ? memberMap.get(message.sender_id) : null;
              
              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isCurrentUser && (
                    <button
                      onClick={() => sender && openFriendCard({
                        userId: sender.user_id,
                        displayName: sender.display_name,
                        avatarUrl: sender.avatar_url,
                        venueName: sender.venue_name || undefined,
                      })}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="h-8 w-8 border-2 border-[#a855f7] shadow-[0_0_10px_rgba(168,85,247,0.4)]">
                        <AvatarImage src={sender?.avatar_url || otherMember?.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                          {sender?.display_name?.[0] || otherMember?.display_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  )}

                  <div className="flex flex-col max-w-[75%]">
                    {/* Show sender name in group chats */}
                    {groupInfo && !isCurrentUser && sender && (
                      <span className="text-white/50 text-xs mb-1 ml-1">{sender.display_name.split(' ')[0]}</span>
                    )}
                    <div
                      className={`rounded-2xl overflow-hidden ${
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
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 text-white/50 text-sm animate-pulse">
          {typingUsers.length === 1
            ? `${typingUsers[0].display_name} is typing...`
            : `${typingUsers.map(u => u.display_name).join(', ')} are typing...`}
        </div>
      )}

      <MessageInput
        onSendMessage={sendMessage}
        onImageUpload={handleImageUpload}
        isUploading={isUploading}
        onTyping={setTyping}
      />
    </div>
  </div>
  );
}
