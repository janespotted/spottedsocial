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
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';

interface ThreadMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Thread {
  id: string;
  is_group: boolean;
  name: string | null;
  members: ThreadMember[];
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
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();

  useEffect(() => {
    if (user) {
      fetchThreads();
    }
  }, [user, bootstrapEnabled, demoEnabled]);

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
      // Step 1: Get user's thread IDs with thread info (1 query)
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

      // Step 2: Batch fetch ALL data in parallel
      const [threadsResult, allMembersResult, allMessagesResult] = await Promise.all([
        // Get thread info (is_group, name)
        supabase
          .from('dm_threads')
          .select('id, is_group, name')
          .in('id', threadIds),
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

      const threadInfoMap = new Map((threadsResult.data || []).map(t => [t.id, t]));
      const allMembers = allMembersResult.data || [];
      const allMessages = allMessagesResult.data || [];

      // Get unique other user IDs
      const otherUserIds = [...new Set(allMembers.map(m => m.user_id))];

      // Step 3: Batch fetch profiles and statuses for all other users
      const [profilesResult, statusesResult] = await Promise.all([
        supabase.rpc('get_profiles_safe'),
        supabase
          .from('night_statuses')
          .select('user_id, venue_name')
          .in('user_id', otherUserIds),
      ]);

      const allProfiles = profilesResult.data || [];
      const profiles = allProfiles.filter((p: any) => otherUserIds.includes(p.id));
      const statuses = statusesResult.data || [];

      // In bootstrap mode (not demo mode), filter out demo users
      const filteredProfiles = (bootstrapEnabled && !demoEnabled) 
        ? profiles.filter((p: any) => !p.is_demo)
        : profiles;

      // Create lookup maps for O(1) access
      const profileMap = new Map(filteredProfiles.map((p: any) => [p.id, p]));
      const statusMap = new Map(statuses.map(s => [s.user_id, s.venue_name]));
      
      // Group messages by thread and get latest
      const latestMessageByThread = new Map<string, typeof allMessages[0]>();
      for (const msg of allMessages) {
        if (!latestMessageByThread.has(msg.thread_id)) {
          latestMessageByThread.set(msg.thread_id, msg);
        }
      }

      // Group members by thread
      const membersByThread = new Map<string, typeof allMembers>();
      for (const member of allMembers) {
        const existing = membersByThread.get(member.thread_id) || [];
        existing.push(member);
        membersByThread.set(member.thread_id, existing);
      }

      // Build threads data in JavaScript
      const threadsData: Thread[] = [];
      
      for (const { thread_id } of threadMemberships) {
        const threadInfo = threadInfoMap.get(thread_id);
        const threadMembers = membersByThread.get(thread_id) || [];
        
        if (threadMembers.length === 0) continue;

        // Build members array with profile info
        const members: ThreadMember[] = threadMembers
          .map(m => {
            const profile = profileMap.get(m.user_id);
            if (!profile) return null;
            return {
              user_id: m.user_id,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
            };
          })
          .filter((m): m is ThreadMember => m !== null);

        if (members.length === 0) continue;

        const latestMessage = latestMessageByThread.get(thread_id);
        // For 1:1 chats, get the venue of the other person
        const venueName = members.length === 1 ? statusMap.get(members[0].user_id) || null : null;

        // Calculate unread: if last message is from other user and within 30 min
        const isUnread = latestMessage && 
                        latestMessage.sender_id !== user.id && 
                        (Date.now() - new Date(latestMessage.created_at).getTime() < 30 * 60000);

        threadsData.push({
          id: thread_id,
          is_group: threadInfo?.is_group || false,
          name: threadInfo?.name || null,
          members,
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

  const getThreadDisplayName = (thread: Thread): string => {
    if (thread.is_group && thread.name) return thread.name;
    if (thread.is_group) {
      // Generate name from members
      const names = thread.members.map(m => m.display_name.split(' ')[0]);
      if (names.length <= 3) return names.join(', ');
      return `${names.slice(0, 2).join(', ')} & ${names.length - 2} others`;
    }
    return thread.members[0]?.display_name || 'Unknown';
  };

  const filteredThreads = threads.filter(t => {
    const displayName = getThreadDisplayName(t);
    return displayName.toLowerCase().includes(search.toLowerCase());
  });

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
                Your inbox is ready
              </h3>
              <p className="text-white/50 text-sm max-w-xs mb-4">
                When you message friends or they message you, conversations live here.
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full px-6 py-2.5 font-medium transition-colors mb-4"
              >
                Start a Chat
              </button>
              <p className="text-white/30 text-xs">
                💡 When you're both at the same spot, start a conversation!
              </p>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => navigate(`/messages/${thread.id}`)}
                className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4 hover:bg-[#2d1b4e]/80 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {thread.is_group ? (
                    // Group avatar - grid of member avatars
                    <div className="w-14 h-14 rounded-full bg-[#1a0f2e] border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)] flex items-center justify-center overflow-hidden">
                      {thread.members.length <= 4 ? (
                        <div className="grid grid-cols-2 gap-0.5 w-full h-full p-1">
                          {thread.members.slice(0, 4).map((member) => (
                            <Avatar key={member.user_id} className="w-full h-full rounded-sm">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#2d1b4e] text-white text-[10px] rounded-sm">
                                {member.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#a855f7] text-lg font-bold">{thread.members.length}</span>
                      )}
                    </div>
                  ) : (
                    // Single user avatar (1:1 chat)
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (thread.members[0]) {
                          openFriendCard({
                            userId: thread.members[0].user_id,
                            displayName: thread.members[0].display_name,
                            avatarUrl: thread.members[0].avatar_url,
                            venueName: thread.venue_name || undefined,
                          });
                        }
                      }}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="h-14 w-14 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)] cursor-pointer">
                        <AvatarImage src={thread.members[0]?.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white">
                          {thread.members[0]?.display_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white truncate">
                        {getThreadDisplayName(thread)}
                      </h3>
                      {thread.is_group && (
                        <span className="text-white/40 text-xs">({thread.members.length + 1})</span>
                      )}
                    </div>
                    {!thread.is_group && thread.venue_name && (
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
