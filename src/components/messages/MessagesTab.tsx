import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Plus, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { NewChatDialog } from './NewChatDialog';
import { PullToRefresh } from '@/components/PullToRefresh';

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
        // Get ALL members of this thread
        const { data: allMembers } = await supabase
          .from('dm_thread_members')
          .select('user_id')
          .eq('thread_id', thread_id);

        // Find the other user (not current user)
        const otherUserId = allMembers?.find(m => m.user_id !== user?.id)?.user_id;
        
        if (!otherUserId) {
          console.log('No other user found for thread:', thread_id);
          return null;
        }

        // Get other user's profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', otherUserId)
          .single();

        if (!profile) {
          console.log('Profile not found for user:', otherUserId);
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
          .eq('user_id', otherUserId)
          .maybeSingle();

        // Calculate unread: if last message is from other user and within 30 min, show unread
        const isUnread = latestMessage?.sender_id === otherUserId && 
                        (Date.now() - new Date(latestMessage.created_at).getTime() < 30 * 60000);

        return {
          id: thread_id,
          user_id: otherUserId,
          profiles: profile,
          venue_name: status?.venue_name || null,
          last_message: latestMessage,
          unread_count: isUnread ? 1 : 0,
        };
      })
    );

    const validThreads = threadsData.filter(t => t !== null);
    console.log('Valid threads:', validThreads.length);
    setThreads(validThreads);
  };

  const getTimeAgo = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  return (
    <PullToRefresh onRefresh={fetchThreads}>
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
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6 border border-[#a855f7]/20">
                <MessageSquare className="h-10 w-10 text-[#a855f7]/60" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                No messages yet
              </h3>
              <p className="text-white/50 text-sm max-w-xs mb-6">
                Start a conversation with friends to see your messages here
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full px-6 py-2 font-medium transition-colors"
              >
                Start a Chat
              </button>
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
    </PullToRefresh>
  );
}
