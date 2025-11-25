import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { NewChatDialog } from './NewChatDialog';

interface Thread {
  id: string;
  user_id: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  };
  venue_name: string | null;
  last_message: {
    text: string;
    created_at: string;
  } | null;
  unread_count: number;
}

interface PreselectedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface MessagesTabProps {
  preselectedUser?: PreselectedUser | null;
  onClearPreselection?: () => void;
}

export function MessagesTab({ preselectedUser, onClearPreselection }: MessagesTabProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  useEffect(() => {
    if (user) {
      fetchThreads();
    }
  }, [user]);

  useEffect(() => {
    // Auto-open dialog if we have a preselected user
    if (preselectedUser) {
      setShowNewChat(true);
    }
  }, [preselectedUser]);

  const fetchThreads = async () => {
    console.log('📨 Fetching message threads...');
    
    // Get user's thread memberships
    const { data: threadMemberships, error: membershipsError } = await supabase
      .from('dm_thread_members')
      .select('thread_id')
      .eq('user_id', user?.id);

    console.log('Thread memberships:', threadMemberships?.length || 0, 'threads');
    
    if (membershipsError) {
      console.error('Error fetching thread memberships:', membershipsError);
      return;
    }

    if (!threadMemberships || threadMemberships.length === 0) {
      console.log('No thread memberships found');
      return;
    }

    // For each thread, get the other member and latest message
    const threadsData = await Promise.all(
      threadMemberships.map(async ({ thread_id }) => {
        // Get other member
        const { data: members, error: membersError } = await supabase
          .from('dm_thread_members')
          .select(`
            user_id,
            profiles:user_id (
              display_name,
              avatar_url
            )
          `)
          .eq('thread_id', thread_id)
          .neq('user_id', user?.id)
          .single();

        if (membersError) {
          console.error('Error fetching thread members:', membersError);
          return null;
        }

        // Get latest message with sender info
        const { data: latestMessage } = await supabase
          .from('dm_messages')
          .select('text, created_at, sender_id')
          .eq('thread_id', thread_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get other user's current venue
        const { data: status } = await supabase
          .from('night_statuses')
          .select('venue_name')
          .eq('user_id', members?.user_id)
          .maybeSingle();

        // Calculate unread: if last message is from other user and within 30 min, show unread
        const isUnread = latestMessage?.sender_id === members?.user_id && 
                        (Date.now() - new Date(latestMessage.created_at).getTime() < 30 * 60000);

        const threadData = {
          id: thread_id,
          user_id: members?.user_id,
          profiles: members?.profiles,
          venue_name: status?.venue_name || null,
          last_message: latestMessage,
          unread_count: isUnread ? 1 : 0,
        };
        
        console.log('Thread data:', {
          id: thread_id.slice(0, 8),
          hasProfiles: !!members?.profiles,
          hasMessage: !!latestMessage,
          venue: status?.venue_name,
        });
        
        return threadData;
      })
    );

    const validThreads = threadsData.filter(t => t && t.profiles);
    console.log('Valid threads:', validThreads.length);
    setThreads(validThreads);
  };

  const getTimeAgo = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0a0118] border border-[#a855f7]/20 rounded-full pl-12 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#a855f7]/50"
        />
      </div>

      {/* Messages Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Messages</h2>
        <button 
          onClick={() => setShowNewChat(true)}
          className="text-white hover:text-[#d4ff00] transition-colors"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* New Chat Dialog */}
      <NewChatDialog 
        open={showNewChat} 
        onOpenChange={(open) => {
          setShowNewChat(open);
          if (!open && onClearPreselection) {
            onClearPreselection();
          }
        }}
        preselectedUser={preselectedUser}
      />

      {/* Messages List */}
      <div className="space-y-3">
        {threads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/60">No messages yet</p>
            <p className="text-white/40 text-sm mt-2">Start chatting with friends</p>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => navigate(`/messages/${thread.id}`)}
              className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4 hover:bg-[#2d1b4e]/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFriendCard({
                        userId: thread.user_id,
                        displayName: thread.profiles?.display_name || 'Friend',
                        avatarUrl: thread.profiles?.avatar_url || null,
                        venueName: thread.venue_name || undefined,
                      });
                    }}
                    className="hover:opacity-80 transition-opacity"
                  >
                  <Avatar className="h-14 w-14 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)] cursor-pointer">
                    <AvatarImage src={thread.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#1a0f2e] text-white">
                      {thread.profiles?.display_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                </button>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">
                    {thread.profiles?.display_name}
                  </h3>
                  {thread.venue_name && (
                    <p className="text-[#d4ff00] text-sm font-medium">@{thread.venue_name}</p>
                  )}
                  {thread.last_message && (
                    <p className="text-white/60 text-sm truncate mt-0.5">
                      {thread.last_message.text}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {thread.last_message && (
                    <span className="text-white/40 text-xs">
                      {getTimeAgo(thread.last_message.created_at).replace('about ', '')}
                    </span>
                  )}
                  {thread.unread_count > 0 && (
                    <div className="bg-[#a855f7] rounded-full w-2 h-2" />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
