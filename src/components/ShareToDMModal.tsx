import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Users, Link2, MessageSquare, Check } from 'lucide-react';
import { toast } from 'sonner';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import type { Post } from '@/hooks/useFeed';

interface ShareToDMModalProps {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShareFriend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_out: boolean;
}

export function ShareToDMModal({ post, open, onOpenChange }: ShareToDMModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const demoEnabled = useDemoMode();
  const [friends, setFriends] = useState<ShareFriend[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSent(new Set());
      return;
    }
    if (!friendIds || !allProfiles || !post) return;

    const loadFriends = async () => {
      let eligibleIds = new Set<string>(friendIds);

      // If not the current user's post, filter to mutual friends
      if (post.user_id !== user?.id) {
        const [s, r] = await Promise.all([
          supabase.from('friendships').select('friend_id').eq('user_id', post.user_id).eq('status', 'accepted'),
          supabase.from('friendships').select('user_id').eq('friend_id', post.user_id).eq('status', 'accepted'),
        ]);
        const posterFriends = new Set([
          ...(s.data?.map(f => f.friend_id) || []),
          ...(r.data?.map(f => f.user_id) || []),
        ]);
        eligibleIds = new Set(friendIds.filter(id => posterFriends.has(id)));
      }

      // Get night statuses to know who's out
      const { data: statuses } = await supabase
        .from('night_statuses')
        .select('user_id, status')
        .in('user_id', [...eligibleIds])
        .eq('status', 'out')
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString());

      const outIds = new Set((statuses || []).map(s => s.user_id));

      // Get recent DM threads to sort by recency
      const { data: threadMembers } = await supabase
        .from('dm_thread_members')
        .select('thread_id, user_id')
        .eq('user_id', user!.id);

      let recentFriendOrder: string[] = [];
      if (threadMembers?.length) {
        const threadIds = threadMembers.map(t => t.thread_id);
        const { data: allMembers } = await supabase
          .from('dm_thread_members')
          .select('thread_id, user_id')
          .in('thread_id', threadIds)
          .neq('user_id', user!.id);

        const { data: latestMsgs } = await supabase
          .from('dm_messages')
          .select('thread_id, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false });

        // Map thread to latest message time
        const threadRecency = new Map<string, string>();
        for (const msg of latestMsgs || []) {
          if (!threadRecency.has(msg.thread_id)) {
            threadRecency.set(msg.thread_id, msg.created_at);
          }
        }

        // Map friend to thread, sorted by recency
        const friendThreadMap = new Map<string, string>();
        for (const m of allMembers || []) {
          const time = threadRecency.get(m.thread_id);
          if (time && eligibleIds.has(m.user_id)) {
            const existing = friendThreadMap.get(m.user_id);
            if (!existing || time > existing) {
              friendThreadMap.set(m.user_id, time);
            }
          }
        }

        recentFriendOrder = [...friendThreadMap.entries()]
          .sort((a, b) => b[1].localeCompare(a[1]))
          .map(([id]) => id);
      }

      let profiles = allProfiles.filter((p: any) => eligibleIds.has(p.id));
      if (!demoEnabled) {
        profiles = profiles.filter((p: any) => !p.is_demo);
      }

      const friendsList: ShareFriend[] = profiles.map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
        is_out: outIds.has(p.id),
      }));

      // Sort: recent DM contacts first, then out friends, then alphabetical
      const recentSet = new Set(recentFriendOrder);
      friendsList.sort((a, b) => {
        const aRecent = recentFriendOrder.indexOf(a.id);
        const bRecent = recentFriendOrder.indexOf(b.id);
        if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;
        if (a.is_out !== b.is_out) return a.is_out ? -1 : 1;
        return a.display_name.localeCompare(b.display_name);
      });

      setFriends(friendsList);
    };

    loadFriends();
  }, [open, friendIds, allProfiles, demoEnabled, post, user?.id]);

  const handleSend = useCallback(async (friendId: string) => {
    if (!user || !post || sending) return;
    setSending(friendId);

    try {
      const { data: threadId, error } = await supabase.rpc('create_dm_thread', { friend_id: friendId });
      if (error) throw error;

      const { error: msgError } = await supabase.from('dm_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        text: `[shared_post:${post.id}]`,
      });
      if (msgError) throw msgError;

      setSent(prev => new Set(prev).add(friendId));
      toast.success('Sent!');
    } catch (error) {
      console.error('Error sharing post:', error);
      toast.error('Failed to send');
    } finally {
      setSending(null);
    }
  }, [user, post, sending]);

  const getPostUrl = () => {
    if (!post) return APP_BASE_URL;
    return `${APP_BASE_URL}/post/${post.id}`;
  };

  const handleCopyLink = async () => {
    if (!post) return;
    const postUrl = getPostUrl();
    await copyToClipboard(postUrl);
    toast.success('Link copied!', { position: 'top-center' });
  };

  const handleExternalShare = async () => {
    if (!post) return;
    const postUrl = getPostUrl();
    const shareData = {
      title: `${post.profiles?.display_name} on Spotted`,
      text: `${post.text || ''}${post.venue_name ? ` @ ${post.venue_name}` : ''}`,
      url: postUrl,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await copyToClipboard(`${shareData.text} - ${postUrl}`);
      toast.success('Link copied!', { position: 'top-center' });
    }
  };

  const handleSendViaMessages = () => {
    if (!post) return;
    const postUrl = getPostUrl();
    const text = `Check this out on Spotted: ${post.text || ''}${post.venue_name ? ` @ ${post.venue_name}` : ''} ${postUrl}`;
    const smsUrl = `sms:&body=${encodeURIComponent(text)}`;
    window.location.href = smsUrl;
  };

  const filtered = search.trim()
    ? friends.filter(f =>
        f.display_name.toLowerCase().includes(search.toLowerCase()) ||
        f.username.toLowerCase().includes(search.toLowerCase())
      )
    : friends;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-[#1a0f2e] border-[#a855f7]/30">
        <div className="px-5 pb-6 pt-2">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="pl-10 bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white placeholder:text-white/30 rounded-xl h-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-white/20"
            />
          </div>

          {/* Friends grid */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-3 gap-4 mb-5 max-h-[40vh] overflow-y-auto">
              {filtered.slice(0, 12).map((friend) => {
                const isSent = sent.has(friend.id);
                const isSending = sending === friend.id;
                return (
                  <button
                    key={friend.id}
                    onClick={() => !isSent && handleSend(friend.id)}
                    disabled={isSending || isSent}
                    className="flex flex-col items-center gap-1.5 py-2 hover:opacity-80 transition-opacity disabled:opacity-100"
                  >
                    <div className="relative">
                      <Avatar className={`h-16 w-16 border-2 ${isSent ? 'border-[#d4ff00]' : 'border-white/15'}`}>
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#2d1b4e] text-white text-lg">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      {friend.is_out && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#22c55e] border-2 border-[#1a0f2e] rounded-full" />
                      )}
                      {isSending && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                          <Loader2 className="h-5 w-5 text-white animate-spin" />
                        </div>
                      )}
                      {isSent && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                          <Check className="h-5 w-5 text-[#d4ff00]" />
                        </div>
                      )}
                    </div>
                    <span className="text-white/70 text-[11px] text-center leading-tight truncate w-full">
                      {friend.display_name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 mb-5">
              <p className="text-white/40 text-sm">
                {search.trim() ? `No results for "${search}"` : 'No friends to share with'}
              </p>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-white/10 mb-5" />

          {/* Bottom actions */}
          <div className="flex items-center justify-around">
            <button
              onClick={handleExternalShare}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-14 h-14 rounded-full bg-[#2d1b4e] border border-white/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-[#a855f7]" />
              </div>
              <span className="text-white/50 text-[11px]">Invite</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-14 h-14 rounded-full bg-[#2d1b4e] border border-white/10 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-[#a855f7]" />
              </div>
              <span className="text-white/50 text-[11px]">Copy Link</span>
            </button>
            <button
              onClick={handleSendViaMessages}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-14 h-14 rounded-full bg-[#22c55e] flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="text-white/50 text-[11px]">Messages</span>
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
