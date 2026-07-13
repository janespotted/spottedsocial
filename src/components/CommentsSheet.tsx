import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, ArrowUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

// iOS keyboard animation feel
const KB_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const KB_MS = 260;

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
  // Outer wrapper that we transform imperatively for keyboard avoidance.
  // It is NOT a motion component and has no React-managed style prop, so
  // re-renders (e.g. while typing) never clobber the imperative styles.
  const kbWrapRef = useRef<HTMLDivElement>(null);

  // Fetch comments when opening
  useEffect(() => {
    if (open && postId) {
      onFetchComments(postId);
    }
    if (!open) {
      setText('');
    }
  }, [open, postId]);

  // Auto-focus the input as the sheet opens, while the tap's user-activation
  // window is still live, so the sheet and keyboard rise together.
  useEffect(() => {
    if (open && postId) {
      const t = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 180);
      return () => clearTimeout(t);
    }
  }, [open, postId]);

  // ── Keyboard avoidance ──────────────────────────────────────────────
  // Problem this solves (visible in screen recordings): with
  // Keyboard.resize:'native', iOS finishes the ENTIRE keyboard animation
  // before Capacitor resizes the webview (~300-450ms late). A bottom-anchored
  // sheet therefore gets covered by the keyboard, sits buried for a beat,
  // then snaps up when the late resize lands.
  //
  // Fix: 'keyboardWillShow' fires BEFORE the keyboard animates and includes
  // its height. We immediately animate the sheet up by that height (riding
  // with the keyboard). When the late webview resize finally arrives, the
  // sheet's bottom anchor moves up by the same amount — so we remove the
  // transform in the same frame WITHOUT animation, and nothing visibly moves.
  // The formula `outstanding = keyboardHeight - resizeApplied` handles
  // show/hide in any event order.
  useEffect(() => {
    if (!open) return;
    const wrap = kbWrapRef.current;
    if (!wrap) return;
    const vv = window.visualViewport;

    let kb = 0;
    let baseline = vv?.height ?? window.innerHeight;

    // iOS reports a keyboard height that includes the home-indicator safe
    // area, so lifting by the raw value overshoots slightly. Measure the
    // safe-area inset and subtract it for the animated lift; the viewport
    // resize (when it lands) is the ground truth and clamps any residual.
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
    document.body.appendChild(probe);
    const safeBottom = probe.getBoundingClientRect().height;
    probe.remove();

    // Initial height cap: 75% of the pre-keyboard viewport.
    wrap.style.maxHeight = `${Math.round(baseline * 0.75)}px`;

    const apply = (animated: boolean) => {
      const current = vv?.height ?? window.innerHeight;
      const resized = Math.max(0, baseline - current);
      const outstanding = kb - resized;
      wrap.style.transition = animated
        ? `transform ${KB_MS}ms ${KB_EASE}, max-height ${KB_MS}ms ${KB_EASE}`
        : 'none';
      wrap.style.transform =
        outstanding !== 0 ? `translate3d(0, ${-outstanding}px, 0)` : '';
      // Keep the sheet's top on screen while lifted: cap height to the
      // space that will remain above the keyboard.
      wrap.style.maxHeight = kb > 0
        ? `${Math.max(baseline - kb - 12, 160)}px`
        : `${Math.round(baseline * 0.75)}px`;
    };

    const onWillShow = (e: Event) => {
      const reported = (e as unknown as { keyboardHeight?: number }).keyboardHeight ?? 0;
      kb = Math.max(0, reported - safeBottom);
      baseline = Math.max(baseline, vv?.height ?? window.innerHeight);
      apply(true);
    };
    const onWillHide = () => {
      kb = 0;
      apply(true);
    };
    const onViewportResize = () => {
      // The native resize landed — it is the ground truth for how far the
      // viewport actually moved. Adopt it as the keyboard height (fixing any
      // over/under-lift), then swap animated offset for real layout
      // instantly, so the frame doesn't visibly change.
      if (kb > 0) {
        const current = vv?.height ?? window.innerHeight;
        const resized = Math.max(0, baseline - current);
        if (resized > 0) kb = resized;
      }
      apply(false);
    };

    window.addEventListener('keyboardWillShow', onWillShow);
    window.addEventListener('keyboardWillHide', onWillHide);
    vv?.addEventListener('resize', onViewportResize);
    return () => {
      window.removeEventListener('keyboardWillShow', onWillShow);
      window.removeEventListener('keyboardWillHide', onWillHide);
      vv?.removeEventListener('resize', onViewportResize);
      // Deliberately NOT resetting styles here: during the exit animation the
      // sheet should keep its lifted position while it slides away.
    };
  }, [open]);

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
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="comments-backdrop"
            className="fixed inset-0 z-[199] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Keyboard-offset wrapper (transformed imperatively above) */}
          <div
            ref={kbWrapRef}
            className="fixed inset-x-0 bottom-0 z-[200] flex flex-col justify-end pointer-events-none"
          >
            <motion.div
              key="comments-sheet"
              className="pointer-events-auto max-h-full bg-[#1a0f2e] border-t border-white/10 rounded-t-2xl flex flex-col"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 80 || info.velocity.y > 500) {
                  onOpenChange(false);
                }
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 flex-shrink-0">
                <div className="w-12 h-1.5 rounded-full bg-white/15" />
              </div>

              {/* Header */}
              <div className="text-center py-3 border-b border-white/[0.06] flex-shrink-0">
                <h3 className="text-white font-bold text-base">Comments</h3>
              </div>

              {/* Comments list — scrollable */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 min-h-0">
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
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
