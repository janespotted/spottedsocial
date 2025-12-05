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
import { MessagesSkeleton } from './MessagesSkeleton';

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
  const [isLoading, setIsLoading] = useState(true);

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
    if (!user?.id) return;
    
    setIsLoading(true);
    console.log('📨 Fetching message threads (optimized)...');
    
    try {
      // Step 1: Get user's thread IDs (1 query)
      const { data: threadMemberships, error: membershipsError } = await supabase
        .from('dm_thread_members')
        .select('thread_id')
        .eq('user_id', user.id);

      if (membershipsError) {
        console.error('Error fetching thread memberships:', membershipsError);
        return;
      }

      if (!threadMemberships || threadMemberships.length === 0) {
        console.log('No thread memberships found');
        setThreads([]);
        return;
      }

      const threadIds = threadMemberships.map(t => t.thread_id);
      console.log('Found', threadIds.length, 'threads');

      // Step 2: Batch fetch ALL data in parallel (3 queries instead of 4 per thread)
      const [allMembersResult, allMessagesResult] = await Promise.all([
        // Get ALL members for all threads at once
        supabase
          .from('dm_thread_members')
          .select('thread_id, user_id')
          .in('thread_id', threadIds)
          .neq('user_id', user.id),
        
        // Get ALL messages for all threads at once (we'll pick latest per thread)
        supabase
          .from('dm_messages')
          .select('thread_id, text, created_at, sender_id')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false }),
      ]);

      const allMembers = allMembersResult.data || [];
      const allMessages = allMessagesResult.data || [];

      // Get unique other user IDs
      const otherUserIds = [...new Set(allMembers.map(m => m.user_id))];

      // Step 3: Batch fetch profiles and statuses for all other users
      const [profilesResult, statusesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', otherUserIds),
        
        supabase
          .from('night_statuses')
          .select('user_id, venue_name')
          .in('user_id', otherUserIds),
      ]);

      const profiles = profilesResult.data || [];
      const statuses = statusesResult.data || [];

      // Create lookup maps for O(1) access
      const profileMap = new Map(profiles.map(p => [p.id, p]));
      const statusMap = new Map(statuses.map(s => [s.user_id, s.venue_name]));
      
      // Group messages by thread and get latest
      const latestMessageByThread = new Map<string, typeof allMessages[0]>();
      for (const msg of allMessages) {
        if (!latestMessageByThread.has(msg.thread_id)) {
          latestMessageByThread.set(msg.thread_id, msg);
        }
      }

      // Build threads data in JavaScript (no more queries!)
      const threadsData: Thread[] = [];
      
      for (const { thread_id } of threadMemberships) {
        const otherMember = allMembers.find(m => m.thread_id === thread_id);
        if (!otherMember) continue;

        const profile = profileMap.get(otherMember.user_id);
        if (!profile) continue;

        const latestMessage = latestMessageByThread.get(thread_id);
        const venueName = statusMap.get(otherMember.user_id) || null;

        // Calculate unread: if last message is from other user and within 30 min
        const isUnread = latestMessage?.sender_id === otherMember.user_id && 
                        latestMessage && 
                        (Date.now() - new Date(latestMessage.created_at).getTime() < 30 * 60000);

        threadsData.push({
          id: thread_id,
          user_id: otherMember.user_id,
          profiles: {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          },
          venue_name: venueName,
          last_message: latestMessage ? {
            text: latestMessage.text,
            created_at: latestMessage.created_at,
          } : null,
          unread_count: isUnread ? 1 : 0,
        });
      }

      // Sort by latest message
      threadsData.sort((a, b) => {
        if (!a.last_message && !b.last_message) return 0;
        if (!a.last_message) return 1;
        if (!b.last_message) return -1;
        return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
      });

      console.log('✅ Optimized fetch complete:', threadsData.length, 'threads');
      setThreads(threadsData);
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeAgo = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  const filteredThreads = threads.filter(t => 
    t.profiles?.display_name?.toLowerCase().includes(search.toLowerCase())
  );

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
          {isLoading ? (
            <MessagesSkeleton />
          ) : filteredThreads.length === 0 ? (
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
            filteredThreads.map((thread) => (
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
