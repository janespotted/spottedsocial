import React, { useState, memo, useCallback } from 'react';
import { Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInputFocus } from '@/contexts/InputFocusContext';

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

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSubmit(postId, text);
      setText('');
    }
  }, [postId, text, onSubmit]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setInputFocused(true);
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
  }, [setInputFocused]);

  const handleBlur = useCallback(() => {
    setInputFocused(false);
  }, [setInputFocused]);

  return (
    <div className="flex gap-2 items-end pt-2">
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={userAvatarUrl} />
        <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
          {userInitial}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Add a comment..."
          maxLength={500}
          className="flex-1 bg-[#1a0f2e]/60 border border-white/10 rounded-full px-4 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#d4ff00]/40"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="text-[#d4ff00] hover:text-[#d4ff00]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
});
