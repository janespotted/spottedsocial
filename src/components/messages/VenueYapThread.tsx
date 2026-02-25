import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, ChevronUp, ChevronDown, Send, Image, X, MoreHorizontal, ArrowLeft, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { YapSkeleton } from './MessagesSkeleton';
import { validateYapText, validateYapCommentText } from '@/lib/validation-schemas';
import { checkAndRecordRateLimit, getRateLimitMessage } from '@/lib/rate-limit';
import { LoginPromptSheet } from '@/components/LoginPromptSheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface YapMessage {
  id: string;
  text: string;
  created_at: string;
  is_anonymous: boolean;
  venue_name: string;
  author_handle: string | null;
  image_url: string | null;
  media_type: string | null;
  user_id: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  } | null;
  score: number;
  comments_count: number;
  user_vote: 'up' | 'down' | null;
}

interface YapComment {
  id: string;
  text: string;
  created_at: string;
  is_anonymous: boolean;
  author_handle: string | null;
  user_id: string;
  score: number;
  user_vote: 'up' | 'down' | null;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

interface VenueYapThreadProps {
  venueName: string;
  canPost: boolean;
  onBack: () => void;
}

const VENUE_COOLDOWN_MS = 30_000;

export function VenueYapThread({ venueName, canPost, onBack }: VenueYapThreadProps) {
  const { user } = useAuth();
  const demoMode = useDemoMode();
  const [messages, setMessages] = useState<YapMessage[]>([]);
  const [sortBy, setSortBy] = useState<'new' | 'hot'>('new');
  const [newYap, setNewYap] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [expandedYapId, setExpandedYapId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, YapComment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [revealedBuriedIds, setRevealedBuriedIds] = useState<Set<string>>(new Set());
  const [moderationYapId, setModerationYapId] = useState<string | null>(null);
  const [moderationUserId, setModerationUserId] = useState<string | null>(null);

  const lastPostTimeRef = useRef<Record<string, number>>({});
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user) fetchBlockedUsers();
  }, [user]);

  const fetchBlockedUsers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);
    if (data) setBlockedUserIds(new Set(data.map(b => b.blocked_id)));
  };

  const updateCooldown = useCallback(() => {
    const lastTime = lastPostTimeRef.current[venueName];
    if (!lastTime) { setCooldownRemaining(0); return; }
    const remaining = Math.max(0, VENUE_COOLDOWN_MS - (Date.now() - lastTime));
    setCooldownRemaining(remaining);
    if (remaining <= 0 && cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  }, [venueName]);

  useEffect(() => {
    updateCooldown();
    return () => { if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current); };
  }, [venueName, updateCooldown]);

  useEffect(() => {
    fetchYapMessages();
    if (user) {
      const cleanup = subscribeToYaps();
      return cleanup;
    }
  }, [venueName, sortBy, demoMode, user]);

  useEffect(() => {
    if (blockedUserIds.size > 0) fetchYapMessages();
  }, [blockedUserIds]);

  const requireAuth = (): boolean => {
    if (!user) { setShowLoginPrompt(true); return false; }
    return true;
  };

  const fetchYapMessages = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('yap_messages')
        .select(`*, profiles:user_id (display_name, avatar_url)`)
        .gt('expires_at', new Date().toISOString());

      if (demoMode) {
        query = query.or(`venue_name.eq.${venueName},is_demo.eq.true`);
      } else {
        query = query.eq('venue_name', venueName).eq('is_demo', false);
      }

      const { data: yaps } = await query;
      if (!yaps?.length) { setMessages([]); setIsLoading(false); return; }

      const filteredYaps = yaps.filter(y => !blockedUserIds.has(y.user_id));
      const initialMessages: YapMessage[] = filteredYaps.map(msg => ({ ...msg, user_vote: null }));

      if (sortBy === 'hot') {
        initialMessages.sort((a, b) => b.score !== a.score ? b.score - a.score : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        initialMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      setMessages(initialMessages);
      setIsLoading(false);

      if (user) {
        const yapIds = filteredYaps.map(y => y.id);
        const { data: votes } = await supabase
          .from('yap_votes')
          .select('yap_id, vote_type')
          .eq('user_id', user.id)
          .in('yap_id', yapIds);
        if (votes?.length) {
          const voteMap = new Map<string, 'up' | 'down'>();
          votes.forEach(v => voteMap.set(v.yap_id, v.vote_type as 'up' | 'down'));
          setMessages(prev => prev.map(msg => ({ ...msg, user_vote: voteMap.get(msg.id) || null })));
        }
      }
    } catch (error) {
      console.error('Error fetching yaps:', error);
      setIsLoading(false);
    }
  };

  const subscribeToYaps = () => {
    const channel = supabase
      .channel('yap-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yap_messages', filter: `venue_name=eq.${venueName}` }, () => fetchYapMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const handleVote = async (yapId: string, voteType: 'up' | 'down') => {
    if (!requireAuth()) return;
    const currentMessage = messages.find(m => m.id === yapId);
    if (!currentMessage) return;
    const existingVote = currentMessage.user_vote;
    let scoreDelta = 0;

    if (existingVote === voteType) {
      scoreDelta = voteType === 'up' ? -1 : 1;
      await supabase.from('yap_votes').delete().eq('yap_id', yapId).eq('user_id', user!.id);
    } else if (existingVote) {
      scoreDelta = voteType === 'up' ? 2 : -2;
      await supabase.from('yap_votes').update({ vote_type: voteType }).eq('yap_id', yapId).eq('user_id', user!.id);
    } else {
      scoreDelta = voteType === 'up' ? 1 : -1;
      await supabase.from('yap_votes').insert({ yap_id: yapId, user_id: user!.id, vote_type: voteType });
    }

    await supabase.from('yap_messages').update({ score: currentMessage.score + scoreDelta }).eq('id', yapId);
    setMessages(prev => prev.map(m => m.id === yapId ? { ...m, score: m.score + scoreDelta, user_vote: existingVote === voteType ? null : voteType } : m));
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { toast.error('Only images and videos are supported'); return; }
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) { toast.error(`File too large. Max ${isVideo ? '50MB' : '10MB'}`); return; }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const clearMedia = () => {
    setMediaFile(null);
    if (mediaPreview) { URL.revokeObjectURL(mediaPreview); setMediaPreview(null); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadMedia = async (file: File): Promise<{ url: string; type: string } | null> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${user!.id}/${Date.now()}.${ext}`;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    const { error } = await supabase.storage.from('yap-media').upload(filePath, file);
    if (error) { console.error('Upload error:', error); return null; }
    const { data: { publicUrl } } = supabase.storage.from('yap-media').getPublicUrl(filePath);
    return { url: publicUrl, type: mediaType };
  };

  const handlePostYap = async () => {
    if (!requireAuth()) return;
    if (!newYap.trim() && !mediaFile) return;

    const lastTime = lastPostTimeRef.current[venueName];
    if (lastTime && Date.now() - lastTime < VENUE_COOLDOWN_MS) {
      const remaining = Math.ceil((VENUE_COOLDOWN_MS - (Date.now() - lastTime)) / 1000);
      toast.error(`Wait ${remaining}s before posting in this venue again`);
      return;
    }

    if (newYap.trim()) {
      const validation = validateYapText(newYap);
      if (!validation.success) { toast.error(validation.error || 'Invalid message'); return; }
    }

    const allowed = await checkAndRecordRateLimit('yap_message');
    if (!allowed) { toast.error(getRateLimitMessage('yap_message')); return; }

    setIsPosting(true);
    try {
      const handle = `User${Math.floor(100000 + Math.random() * 900000)}`;
      const now = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + 1);
      expiry.setHours(5, 0, 0, 0);
      if (now.getHours() >= 5) expiry.setDate(expiry.getDate() + 1);

      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (mediaFile) {
        setIsUploading(true);
        const result = await uploadMedia(mediaFile);
        setIsUploading(false);
        if (!result) { toast.error('Failed to upload media'); setIsPosting(false); return; }
        mediaUrl = result.url;
        mediaType = result.type;
      }

      const { error } = await supabase.from('yap_messages').insert({
        user_id: user!.id,
        text: newYap.trim() || (mediaType === 'video' ? '📹' : '📸'),
        venue_name: venueName,
        is_anonymous: true,
        author_handle: handle,
        score: 0,
        comments_count: 0,
        expires_at: expiry.toISOString(),
        image_url: mediaUrl,
        media_type: mediaType,
      });

      if (error) throw error;

      lastPostTimeRef.current[venueName] = Date.now();
      setCooldownRemaining(VENUE_COOLDOWN_MS);
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = setInterval(updateCooldown, 1000);

      setNewYap('');
      clearMedia();
      toast.success('Yap posted!');
      fetchYapMessages();
    } catch (error) {
      console.error('Error posting yap:', error);
      toast.error('Failed to post yap');
    } finally {
      setIsPosting(false);
    }
  };

  const handleReportYap = async (yapId: string) => {
    if (!requireAuth()) return;
    try {
      await supabase.from('reports').insert({ reporter_id: user!.id, reported_yap_id: yapId, reason: 'user_reported' });
      setModerationYapId(null);
      toast.success("Got it — we'll take a look 👍");
    } catch { toast.error('Failed to report'); }
  };

  const handleBlockYapUser = async (targetUserId: string) => {
    if (!requireAuth() || !targetUserId) return;
    try {
      const { error } = await supabase.from('blocked_users').insert({ blocker_id: user!.id, blocked_id: targetUserId });
      if (error && error.code !== '23505') throw error;
      setBlockedUserIds(prev => new Set([...prev, targetUserId]));
      setModerationYapId(null);
      toast.success("Blocked. You won't see posts from this user.");
    } catch { toast.error('Failed to block user'); }
  };

  const fetchComments = async (yapId: string) => {
    const { data } = await supabase
      .from('yap_comments')
      .select(`*, profiles:user_id (display_name, avatar_url)`)
      .eq('yap_id', yapId)
      .order('created_at', { ascending: true });

    if (!data?.length) { setComments(prev => ({ ...prev, [yapId]: [] })); return; }

    const initialComments: YapComment[] = data.map(comment => ({ ...comment, score: comment.score || 0, user_vote: null }));
    setComments(prev => ({ ...prev, [yapId]: initialComments }));

    if (user) {
      const commentIds = data.map(c => c.id);
      const { data: votes } = await supabase
        .from('yap_comment_votes')
        .select('comment_id, vote_type')
        .eq('user_id', user.id)
        .in('comment_id', commentIds);
      if (votes?.length) {
        const voteMap = new Map<string, 'up' | 'down'>();
        votes.forEach(v => voteMap.set(v.comment_id, v.vote_type as 'up' | 'down'));
        setComments(prev => ({
          ...prev,
          [yapId]: prev[yapId]?.map(c => ({ ...c, user_vote: voteMap.get(c.id) || null })) || [],
        }));
      }
    }
  };

  const handleCommentVote = async (yapId: string, commentId: string, voteType: 'up' | 'down') => {
    if (!requireAuth()) return;
    const yapComments = comments[yapId];
    if (!yapComments) return;
    const currentComment = yapComments.find(c => c.id === commentId);
    if (!currentComment) return;
    const existingVote = currentComment.user_vote;
    let scoreDelta = 0;

    if (existingVote === voteType) {
      scoreDelta = voteType === 'up' ? -1 : 1;
      await supabase.from('yap_comment_votes').delete().eq('comment_id', commentId).eq('user_id', user!.id);
    } else if (existingVote) {
      scoreDelta = voteType === 'up' ? 2 : -2;
      await supabase.from('yap_comment_votes').update({ vote_type: voteType }).eq('comment_id', commentId).eq('user_id', user!.id);
    } else {
      scoreDelta = voteType === 'up' ? 1 : -1;
      await supabase.from('yap_comment_votes').insert({ comment_id: commentId, user_id: user!.id, vote_type: voteType });
    }

    await supabase.from('yap_comments').update({ score: currentComment.score + scoreDelta }).eq('id', commentId);
    setComments(prev => ({
      ...prev,
      [yapId]: prev[yapId].map(c => c.id === commentId ? { ...c, score: c.score + scoreDelta, user_vote: existingVote === voteType ? null : voteType } : c),
    }));
  };

  const handleToggleComments = async (yapId: string) => {
    if (expandedYapId === yapId) { setExpandedYapId(null); } else {
      setExpandedYapId(yapId);
      if (!comments[yapId]) await fetchComments(yapId);
    }
  };

  const handlePostComment = async (yapId: string) => {
    if (!requireAuth()) return;
    if (!newComment[yapId]?.trim()) return;
    const validation = validateYapCommentText(newComment[yapId]);
    if (!validation.success) { toast.error(validation.error || 'Invalid comment'); return; }
    const allowed = await checkAndRecordRateLimit('yap_comment');
    if (!allowed) { toast.error(getRateLimitMessage('yap_comment')); return; }

    try {
      const handle = `User${Math.floor(100000 + Math.random() * 900000)}`;
      const { error } = await supabase.from('yap_comments').insert({
        yap_id: yapId, user_id: user!.id, text: validation.data!, is_anonymous: true, author_handle: handle,
      });
      if (error) throw error;
      setNewComment(prev => ({ ...prev, [yapId]: '' }));
      toast.success('Comment posted!');
      await fetchComments(yapId);
      await fetchYapMessages();
    } catch (error) {
      console.error('Error posting comment:', error);
      toast.error('Failed to post comment');
    }
  };

  const getTimeAgo = (date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    return distance.replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm').replace(' hours', 'h').replace(' hour', 'h');
  };

  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);
  const isOnCooldown = cooldownRemaining > 0;

  if (isLoading) return <YapSkeleton />;

  return (
    <div className="space-y-4 pb-24">
      {/* Back + Venue Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-white/60 hover:text-white transition-colors p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-bold text-[#d4ff00]">@{venueName}</h2>
      </div>

      {/* Sort Tabs */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setSortBy('new')}
          className={cn(
            'px-8 py-2 rounded-full border-2 transition-colors font-semibold',
            sortBy === 'new' ? 'border-[#d4ff00] text-[#d4ff00] bg-[#d4ff00]/10' : 'border-white/20 text-white/60'
          )}
        >New</button>
        <button
          onClick={() => setSortBy('hot')}
          className={cn(
            'px-8 py-2 rounded-full border-2 transition-colors font-semibold',
            sortBy === 'hot' ? 'border-white text-white bg-white/10' : 'border-white/20 text-white/60'
          )}
        >Hot</button>
      </div>

      {/* Post Input or Check-in Bar */}
      {canPost ? (
        <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
          <Textarea
            value={newYap}
            onChange={(e) => setNewYap(e.target.value)}
            onFocus={() => { if (!user) setShowLoginPrompt(true); }}
            placeholder="What's happening at the venue? (anonymous)"
            className="bg-[#1a0f2e] border-[#a855f7]/20 text-white placeholder:text-white/40 resize-none"
            rows={3}
            maxLength={280}
          />
          {mediaPreview && (
            <div className="relative mt-2 inline-block">
              {mediaFile?.type.startsWith('video/') ? (
                <video src={mediaPreview} className="max-h-40 rounded-lg border border-[#a855f7]/20" muted />
              ) : (
                <img src={mediaPreview} alt="Preview" className="max-h-40 rounded-lg border border-[#a855f7]/20" />
              )}
              <button onClick={clearMedia} className="absolute -top-2 -right-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-full p-1">
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
              <button onClick={() => { if (!requireAuth()) return; fileInputRef.current?.click(); }} className="text-white/40 hover:text-[#d4ff00] transition-colors" title="Add photo or video">
                <Image className="h-5 w-5" />
              </button>
              <span className="text-white/40 text-sm">{newYap.length}/280</span>
            </div>
            <Button
              onClick={handlePostYap}
              disabled={(!newYap.trim() && !mediaFile) || isPosting || isUploading || isOnCooldown}
              className="bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
            >
              <Send className="h-4 w-4 mr-2" />
              {isUploading ? 'Uploading...' : isOnCooldown ? `Post (0:${cooldownSeconds.toString().padStart(2, '0')})` : 'Post'}
            </Button>
          </div>
        </div>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl px-4 py-3 flex items-center gap-3 cursor-default">
                <MapPin className="h-5 w-5 text-[#d4ff00] shrink-0" />
                <span className="text-white/70 text-sm font-medium">📍 Be here to post</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px] bg-[#1a0f2e] border-[#a855f7]/30 text-white text-xs">
              You can only post on a venue's Yap when you're there. Head over and go live to join the conversation.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Messages */}
      <div className="space-y-3">
        {messages.map((msg) => {
          const isBuried = msg.score <= -8;
          const isRevealed = revealedBuriedIds.has(msg.id);

          if (isBuried && !isRevealed) {
            return (
              <div key={msg.id} className="bg-[#2d1b4e]/30 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-white/50 text-sm">💀 buried by the crowd</span>
                <button onClick={() => setRevealedBuriedIds(prev => new Set([...prev, msg.id]))} className="text-[#a855f7] text-sm font-medium hover:underline">show</button>
              </div>
            );
          }

          return (
            <div key={msg.id} className={cn("bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4", isBuried && isRevealed && "opacity-60")}>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{msg.author_handle || `User${msg.id.slice(0, 6)}`}</span>
                    <span className="text-white/40 text-sm">{getTimeAgo(msg.created_at)}</span>
                    <button
                      onClick={() => { setModerationYapId(msg.id); setModerationUserId(msg.user_id); }}
                      className="ml-auto text-white/30 hover:text-white/60 transition-colors p-1"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-white/90 mt-1 text-[15px]">{msg.text}</p>

                  {msg.image_url && (
                    <div className="mt-2">
                      {msg.media_type === 'video' ? (
                        <video src={msg.image_url} controls className="max-h-64 w-full rounded-lg object-cover border border-[#a855f7]/20" preload="metadata" />
                      ) : (
                        <img src={msg.image_url} alt="Yap media" className="max-h-64 w-full rounded-lg object-cover border border-[#a855f7]/20" loading="lazy" />
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-2">
                    <button onClick={() => handleToggleComments(msg.id)} className="flex items-center gap-1 text-white/60 hover:text-white transition-colors text-sm">
                      <MessageCircle className="h-4 w-4" />
                      <span>{msg.comments_count}</span>
                    </button>
                  </div>

                  {expandedYapId === msg.id && (
                    <div className="mt-4 space-y-3 border-t border-[#a855f7]/20 pt-3">
                      {comments[msg.id]?.map((comment) => (
                        <div key={comment.id} className="flex gap-2">
                          <div className="flex-1 bg-[#1a0f2e]/60 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-white text-sm">{comment.author_handle || `User${comment.id.slice(0, 6)}`}</span>
                              <span className="text-white/40 text-xs">{getTimeAgo(comment.created_at)}</span>
                            </div>
                            <p className="text-white/80 text-sm">{comment.text}</p>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <button onClick={() => handleCommentVote(msg.id, comment.id, 'up')} className={cn('transition-colors', comment.user_vote === 'up' ? 'text-[#d4ff00]' : 'text-white/40 hover:text-[#d4ff00]')}>
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <span className="font-bold text-xs text-white">{comment.score}</span>
                            <button onClick={() => handleCommentVote(msg.id, comment.id, 'down')} className={cn('transition-colors', comment.user_vote === 'down' ? 'text-[#a855f7]' : 'text-white/40 hover:text-[#a855f7]')}>
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newComment[msg.id] || ''}
                          onChange={(e) => setNewComment(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          onFocus={() => { if (!user) setShowLoginPrompt(true); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(msg.id); } }}
                          placeholder="Add a comment..."
                          className="flex-1 bg-[#1a0f2e] border border-[#a855f7]/20 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#a855f7]"
                        />
                        <Button onClick={() => handlePostComment(msg.id)} disabled={!newComment[msg.id]?.trim()} size="sm" className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white">
                          <Send className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => handleVote(msg.id, 'up')} className={cn('transition-colors', msg.user_vote === 'up' ? 'text-[#d4ff00]' : 'text-white/40 hover:text-[#d4ff00]')}>
                    <ChevronUp className="h-5 w-5" />
                  </button>
                  <span className="font-bold text-sm text-white">{msg.score}</span>
                  <button onClick={() => handleVote(msg.id, 'down')} className={cn('transition-colors', msg.user_vote === 'down' ? 'text-[#a855f7]' : 'text-white/40 hover:text-[#a855f7]')}>
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-4 border border-[#a855f7]/20">
              <MessageCircle className="h-8 w-8 text-[#d4ff00]/60" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No yaps yet</h3>
            <p className="text-white/50 text-sm max-w-xs">Be the first to yap about {venueName}.</p>
          </div>
        )}
      </div>

      {/* Moderation Bottom Sheet */}
      <Drawer open={!!moderationYapId} onOpenChange={(open) => { if (!open) { setModerationYapId(null); setModerationUserId(null); } }}>
        <DrawerContent className="bg-[#1a0f2e] border-[#a855f7]/30">
          <DrawerHeader>
            <DrawerTitle className="text-white text-center text-base">Post Options</DrawerTitle>
          </DrawerHeader>
          <div className="px-6 pb-8 space-y-2">
            <button onClick={() => moderationYapId && handleReportYap(moderationYapId)} className="w-full text-left px-4 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white text-sm font-medium">
              Report post
            </button>
            <button onClick={() => moderationUserId && handleBlockYapUser(moderationUserId)} className="w-full text-left px-4 py-3.5 rounded-xl bg-white/5 hover:bg-red-500/10 transition-colors text-red-400 text-sm font-medium">
              Block this user
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <LoginPromptSheet open={showLoginPrompt} onOpenChange={setShowLoginPrompt} />
    </div>
  );
}
