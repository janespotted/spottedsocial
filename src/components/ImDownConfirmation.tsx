import { useImDown } from '@/contexts/ImDownContext';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { haptic } from '@/lib/haptics';

export function ImDownConfirmation() {
  const { 
    senderUserId, 
    senderDisplayName, 
    senderAvatarUrl, 
    showConfirmation, 
    closeConfirmation,
    acceptType,
    venueName
  } = useImDown();
  const navigate = useNavigate();

  useEffect(() => {
    if (showConfirmation) {
      haptic.success();
      
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
    
    if (!senderUserId || !senderDisplayName) {
      console.error('❌ Missing sender info');
      return;
    }

    closeConfirmation();
    navigate('/messages', { 
      state: { 
        preselectedUser: {
          id: senderUserId,
          display_name: senderDisplayName,
          avatar_url: senderAvatarUrl
        }
      } 
    });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeConfirmation();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeConfirmation();
    }
  };

  if (!showConfirmation) return null;

  const firstName = senderDisplayName?.split(' ')[0] || senderDisplayName;
  
  const getMessage = () => {
    if (acceptType === 'venue_invite' && venueName) {
      return `You're going to ${venueName} with ${firstName}!`;
    }
    return `You're meeting up with ${firstName}!`;
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="w-[90%] max-w-md">
        {/* Main Card */}
        <div className="relative bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
          {/* Sender Avatar - Top Left */}
          <Avatar className="absolute top-6 left-6 h-12 w-12 border-2 border-white shadow-lg">
            <AvatarImage src={senderAvatarUrl || undefined} />
            <AvatarFallback className="bg-[#2d1b4e] text-white">
              {senderDisplayName?.[0]}
            </AvatarFallback>
          </Avatar>

          {/* Spotted S - Top Right */}
          <div className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center">
            <img src={spottedLogo} alt="Spotted" className="w-full h-full object-contain" />
          </div>

          {/* Center Content */}
          <div className="flex flex-col items-center text-center mt-4 mb-6">
            {/* Emoji */}
            <div className="text-7xl mb-4 animate-bounce">🥳</div>

            {/* Text */}
            <h2 className="text-2xl font-bold text-white mb-2">
              {getMessage()}
            </h2>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-6 mt-6">
            {/* Close Button */}
            <button
              onClick={handleClose}
              className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 shadow-lg"
              aria-label="Close"
            >
              <X className="w-7 h-7 text-white" />
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
