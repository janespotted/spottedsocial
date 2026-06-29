import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, Send, ArrowUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';

interface Comment {
  id: string;
  text: string;
  user_id: string;
  created_at: string;
  likes_count?: number;
  profiles?: {
    display_name?: string;
    avatar_url?: string | null;
  };
}

interface CommentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string | null;
  comments: Record<string, Comment[]>;
  likedComments: Set<string>;
  onPostComment: (postId: string, text: string) => void;
  onLikeComment: (commentId: string, postId: string) => void;
  onFetchComments: (postId: string) => void;
  getTimeAgo: (date: string) => string;
  userAvatarUrl?: string;
  userInitial?: string;
}

const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

export function CommentsSheet({
  open,
  onOpenChange,
  postId,
  comments,
  likedComments,
  onPostComment,
  onLikeComment,
  onFetchComments,
  getTimeAgo,
  userAvatarUrl,
  userInitial,
}: CommentsSheetProps) {
  const { user } = useAuth();
  const { openFriendCard } = useFriendIdCard();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Fetch comments when opening
  useEffect(() => {
    if (open && postId) {
      onFetchComments(postId);
    }
    if (!open) {
      setText('');
    }
  }, [open, postId]);

  // Scroll to bottom when new comment is added
  const postComments = postId ? comments[postId] || [] : [];
  useEffect(() => {
    if (postComments.length > prevCountRef.current && prevCountRef.current > 0) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = postComments.length;
  }, [postComments.length]);

  const handleSend = useCallback(() => {
    if (!text.trim() || !postId) return;
    onPostComment(postId, text.trim());
    setText('');
    // Keep input focused for follow-up comments
    inputRef.current?.focus();
  }, [text, postId, onPostComment]);

  const handleEmojiTap = (emoji: string) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleAvatarTap = (comment: Comment) => {
    openFriendCard({
      userId: comment.user_id,
      displayName: comment.profiles?.display_name || 'User',
      avatarUrl: comment.profiles?.avatar_url || null,
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="bg-[#1a0f2e] border-t border-white/10 rounded-t-2xl max-h-[75vh] flex flex-col">
        {/* Header */}
        <div className="text-center py-3 border-b border-white/[0.06] flex-shrink-0">
          <h3 className="text-white font-bold text-base">Comments</h3>
        </div>

        {/* Comments list — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {postComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-white/30 text-sm">No comments yet</p>
              <p className="text-white/20 text-xs mt-1">Be the first to comment</p>
            </div>
          ) : (
            <div className="space-y-4">
              {postComments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  {/* Avatar with gradient ring */}
                  <button
                    onClick={() => handleAvatarTap(comment)}
                    className="flex-shrink-0"
                  >
                    <div className="w-9 h-9 rounded-full p-[1.5px]" style={{ background: 'linear-gradient(135deg, #a855f7, #d4ff00)' }}>
                      <Avatar className="w-full h-full border-[1.5px] border-[#1a0f2e]">
                        <AvatarImage src={comment.profiles?.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                          {comment.profiles?.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <button
                        onClick={() => handleAvatarTap(comment)}
                        className="font-semibold text-white text-sm hover:text-[#d4ff00] transition-colors"
                      >
                        {comment.profiles?.display_name || 'User'}
                      </button>
                      <span className="text-white/30 text-xs">{getTimeAgo(comment.created_at)}</span>
                    </div>
                    <p className="text-white/80 text-sm leading-relaxed mt-0.5 break-words">
                      {comment.text}
                    </p>
                  </div>

                  {/* Like button */}
                  <button
                    onClick={() => postId && onLikeComment(comment.id, postId)}
                    className="flex flex-col items-center gap-0.5 pt-1 flex-shrink-0"
                  >
                    <Heart
                      className={`h-4 w-4 transition-colors ${
                        likedComments.has(comment.id) ? 'text-[#d4ff00]' : 'text-white/25'
                      }`}
                      fill={likedComments.has(comment.id) ? 'currentColor' : 'none'}
                    />
                    {(comment.likes_count || 0) > 0 && (
                      <span className="text-[10px] text-white/30">{comment.likes_count}</span>
                    )}
                  </button>
                </div>
              ))}
              <div ref={listEndRef} />
            </div>
          )}
        </div>

        {/* Bottom section — emoji row + input */}
        <div className="flex-shrink-0 border-t border-white/[0.06]">
          {/* Emoji quick-react row */}
          <div className="flex items-center justify-around px-4 py-2 border-b border-white/[0.04]">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiTap(emoji)}
                className="text-xl active:scale-125 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
          >
            <div className="w-8 h-8 rounded-full p-[1.5px] flex-shrink-0" style={{ background: 'linear-gradient(135deg, #a855f7, #d4ff00)' }}>
              <Avatar className="w-full h-full border-[1.5px] border-[#1a0f2e]">
                <AvatarImage src={userAvatarUrl} />
                <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                  {userInitial || '?'}
                </AvatarFallback>
              </Avatar>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Add a comment..."
              maxLength={500}
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                text.trim()
                  ? 'bg-[#d4ff00] text-[#0a0118]'
                  : 'bg-white/10 text-white/20'
              }`}
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
