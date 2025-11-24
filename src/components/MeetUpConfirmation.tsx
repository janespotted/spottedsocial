import { useMeetUp } from '@/contexts/MeetUpContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useEffect } from 'react';
import confetti from 'canvas-confetti';

export function MeetUpConfirmation() {
  const { recipientUserId, recipientDisplayName, recipientAvatarUrl, showConfirmation, closeConfirmation } = useMeetUp();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (showConfirmation) {
      // Trigger confetti animation
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [showConfirmation]);

  const handleOpenChat = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent backdrop click
    console.log('🟢 Chat button clicked! Opening chat with:', recipientUserId, recipientDisplayName);
    
    if (!user || !recipientUserId) {
      console.error('❌ Missing user or recipientUserId:', { user: user?.id, recipientUserId });
      return;
    }

    try {
      // Find or create thread
      console.log('🔍 Searching for existing threads...');
      const { data: existingThreads, error: fetchError } = await supabase
        .from('dm_thread_members')
        .select('thread_id, dm_threads!inner(*)')
        .eq('user_id', user.id);

      if (fetchError) {
        console.error('❌ Error fetching threads:', fetchError);
        return;
      }

      console.log('📋 Existing threads found:', existingThreads?.length);

      let threadId: string | null = null;

      if (existingThreads) {
        for (const thread of existingThreads) {
          const { data: members, error: membersError } = await supabase
            .from('dm_thread_members')
            .select('user_id')
            .eq('thread_id', thread.thread_id);

          if (membersError) {
            console.error('❌ Error fetching thread members:', membersError);
            continue;
          }

          if (members?.length === 2 && members.some(m => m.user_id === recipientUserId)) {
            threadId = thread.thread_id;
            console.log('✅ Found existing thread:', threadId);
            break;
          }
        }
      }

      if (!threadId) {
        console.log('➕ Creating new thread...');
        const { data: newThread, error: createError } = await supabase
          .from('dm_threads')
          .insert({})
          .select()
          .single();

        if (createError) {
          console.error('❌ Error creating thread:', createError);
          return;
        }

        if (newThread) {
          console.log('✅ New thread created:', newThread.id);
          const { error: membersError } = await supabase
            .from('dm_thread_members')
            .insert([
              { thread_id: newThread.id, user_id: user.id },
              { thread_id: newThread.id, user_id: recipientUserId },
            ]);

          if (membersError) {
            console.error('❌ Error adding thread members:', membersError);
            return;
          }

          threadId = newThread.id;
          console.log('✅ Thread members added successfully');
        }
      }

      if (threadId) {
        console.log('🚀 Navigating to thread:', threadId);
        closeConfirmation();
        navigate(`/messages/${threadId}`);
      } else {
        console.error('❌ Failed to get threadId');
      }
    } catch (error) {
      console.error('❌ Error in handleOpenChat:', error);
    }
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent backdrop click
    console.log('↩️ Undo button clicked - cancelling meet up for:', recipientDisplayName);
    closeConfirmation();
    navigate(-1); // Return to previous screen
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeConfirmation();
    }
  };

  if (!showConfirmation) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="w-[90%] max-w-md">
        {/* Main Card */}
        <div className="relative bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
          {/* Recipient Avatar - Top Left */}
          <Avatar className="absolute top-6 left-6 h-12 w-12 border-2 border-white shadow-lg">
            <AvatarImage src={recipientAvatarUrl || undefined} />
            <AvatarFallback className="bg-[#2d1b4e] text-white">
              {recipientDisplayName?.[0]}
            </AvatarFallback>
          </Avatar>

          {/* Spotted S - Top Right */}
          <div className="absolute top-6 right-6 w-10 h-10 rounded-full bg-[#d4ff00] flex items-center justify-center shadow-[0_0_20px_rgba(212,255,0,0.8)]">
            <span className="text-[#2d1b4e] text-xl font-bold">S</span>
          </div>

          {/* Center Content */}
          <div className="flex flex-col items-center text-center mt-4 mb-6">
            {/* Emoji */}
            <div className="text-7xl mb-4 animate-bounce">🥳</div>

            {/* Text */}
            <h2 className="text-2xl font-bold text-white mb-2">
              You sent a Meet Up Notification to {recipientDisplayName}!
            </h2>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-6 mt-6">
            {/* Undo Button */}
            <button
              onClick={handleUndo}
              className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 shadow-lg"
              aria-label="Undo meet up"
            >
              <ArrowLeft className="w-7 h-7 text-white" />
            </button>

            {/* Chat Button */}
            <button
              onClick={handleOpenChat}
              className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 shadow-lg"
              aria-label="Send message"
            >
              <MessageCircle className="w-7 h-7 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
