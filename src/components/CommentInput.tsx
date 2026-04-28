import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInputFocus } from '@/contexts/InputFocusContext';
import { useKeyboardAware } from '@/hooks/useKeyboardAware';

interface CommentInputProps {
  postId: string;
  userAvatarUrl?: string;
  userInitial?: string;
  onSubmit: (postId: string, text: string) => void;
}

export const CommentInput = memo(function CommentInput({
  postId,
  userAvatarUrl,
  userInitial,
  onSubmit
}: CommentInputProps) {
  const [text, setText] = useState('');
  const { setInputFocused } = useInputFocus();
  const { keyboardHeight } = useKeyboardAware();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when mounted
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSubmit(postId, text);
      setText('');
      // Keep focus for rapid commenting
      inputRef.current?.focus();
    }
  }, [postId, text, onSubmit]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="fixed left-0 right-0 z-[100] bg-[#110a24] border-t border-white/8 px-4 py-2"
      style={{
        bottom: keyboardHeight,
        paddingBottom: keyboardHeight > 0 ? 8 : 'max(env(safe-area-inset-bottom, 8px), 8px)',
        transition: 'bottom 250ms ease-out',
      }}
    >
      <div className="flex items-center gap-2 max-w-[430px] mx-auto">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={userAvatarUrl} />
          <AvatarFallback className="bg-[#1a0a2e] text-white text-xs">
            {userInitial}
          </AvatarFallback>
        </Avatar>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Add a comment..."
          maxLength={500}
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="text-[#d4ff00] hover:text-[#d4ff00]/80 transition-colors disabled:opacity-30 p-1"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
});
