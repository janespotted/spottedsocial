import { useMeetUp } from '@/contexts/MeetUpContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import spottedLogo from '@/assets/spotted-s-logo.png';

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

  const handleOpenChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!recipientUserId || !recipientDisplayName) {
      console.error('❌ Missing recipient info');
      return;
    }

    closeConfirmation();
    navigate('/messages', { 
      state: { 
        preselectedUser: {
          id: recipientUserId,
          display_name: recipientDisplayName,
          avatar_url: recipientAvatarUrl
        }
      } 
    });
  };

  const handleUndo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user || !recipientUserId) {
      closeConfirmation();
      navigate(-1);
      return;
    }

    try {
      // Delete the most recent unread meetup notification to this recipient
      await supabase
        .from('notifications')
        .delete()
        .eq('sender_id', user.id)
        .eq('receiver_id', recipientUserId)
        .eq('type', 'meetup_request')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);
    } catch (error) {
      console.error('Error canceling Meet Up:', error);
    }

    closeConfirmation();
    navigate(-1);
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
          <div className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center">
            <img src={spottedLogo} alt="Spotted" className="w-full h-full object-contain" />
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
