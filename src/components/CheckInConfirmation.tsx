import { useCheckIn } from '@/contexts/CheckInContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { Camera, MessageCircle } from 'lucide-react';

export function CheckInConfirmation() {
  const { 
    showCheckInConfirmation, 
    checkInConfirmationType,
    checkInVenueName,
    checkInVenueId,
    checkInNeighborhood,
    checkInPrivacyLevel,
    closeCheckInConfirmation 
  } = useCheckIn();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [phase, setPhase] = useState<'celebration' | 'yap_prompt'>('celebration');

  const handleDismissAndNavigate = () => {
    closeCheckInConfirmation();
    navigate('/map');
  };

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, display_name')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setAvatarUrl(data.avatar_url);
        setDisplayName(data.display_name || '');
      }
    };
    
    if (showCheckInConfirmation) {
      fetchProfile();
      setPhase('celebration');
    }
  }, [user, showCheckInConfirmation]);

  useEffect(() => {
    if (showCheckInConfirmation && checkInConfirmationType === 'out' && checkInVenueId) {
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

      // After 2 seconds, show yap prompt
      const yapTimer = setTimeout(() => {
        setPhase('yap_prompt');
      }, 2500);

      return () => {
        clearInterval(interval);
        clearTimeout(yapTimer);
      };
    } else if (showCheckInConfirmation) {
      // For planning or non-venue check-ins, just show confetti
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
  }, [showCheckInConfirmation, checkInConfirmationType, checkInVenueId]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleDismissAndNavigate();
    }
  };

  const handleShareClick = () => {
    closeCheckInConfirmation();
    navigate('/messages', { state: { activeTab: 'yap', venueName: checkInVenueName } });
  };

  const getPrivacyLabel = (level: string): string => {
    switch (level) {
      case 'close_friends':
        return 'close friends';
      case 'all_friends':
        return 'friends';
      case 'mutual_friends':
        return 'mutual friends';
      default:
        return 'friends';
    }
  };

  if (!showCheckInConfirmation) return null;

  const isOut = checkInConfirmationType === 'out';
  const emoji = isOut ? '🥳' : '🤔';
  const privacyLabel = getPrivacyLabel(checkInPrivacyLevel || 'all_friends');

  // Show yap prompt phase for venue check-ins
  if (phase === 'yap_prompt' && isOut && checkInVenueId) {
    return (
      <div 
        className="fixed inset-0 z-[600] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
        onClick={handleBackdropClick}
      >
        <div className="w-[90%] max-w-md">
          <div className="relative bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
            {/* Top Left - Target emoji */}
            <div className="absolute top-6 left-6 h-12 w-12 flex items-center justify-center text-3xl">
              ✨
            </div>

            {/* Spotted S - Top Right */}
            <div className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center">
              <img src={spottedLogo} alt="Spotted" className="w-full h-full object-contain" />
            </div>

            {/* Center Content */}
            <div className="flex flex-col items-center text-center mt-4 mb-6">
              {/* Text */}
              <h2 className="text-2xl font-bold text-white mb-2">
                What's {checkInVenueName} like tonight?
              </h2>
              <p className="text-white/80 text-sm mb-6">
                Share what it's like — everyone at this spot can see it
              </p>

              {/* Share button */}
              <Button
                onClick={handleShareClick}
                className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-[#c4ee00] to-[#d4ff00] text-black hover:opacity-90 transition-all shadow-[0_0_20px_rgba(212,255,0,0.3)] flex items-center justify-center gap-2 mb-3"
              >
                <MessageCircle className="h-5 w-5" />
                Yap about it
              </Button>

              {/* Maybe later */}
              <button
                onClick={handleDismissAndNavigate}
                className="text-white/60 hover:text-white text-sm transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-[600] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="w-[90%] max-w-md">
        {/* Main Card */}
        <div className="relative bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
          {/* Top Left - Avatar for "out", Target emoji for "planning" */}
          {isOut ? (
            <Avatar className="absolute top-6 left-6 h-12 w-12 border-2 border-white shadow-lg">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="bg-[#2d1b4e] text-white">
                {displayName?.[0] || user?.email?.[0]}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="absolute top-6 left-6 h-12 w-12 flex items-center justify-center text-3xl">
              🎯
            </div>
          )}

          {/* Spotted S - Top Right */}
          <div className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center">
            <img src={spottedLogo} alt="Spotted" className="w-full h-full object-contain" />
          </div>

          {/* Center Content */}
          <div className="flex flex-col items-center text-center mt-4 mb-6">
            {/* Emoji */}
            <div className="text-7xl mb-4 animate-bounce">{emoji}</div>

            {/* Text */}
            {isOut ? (
              <>
                <h2 className="text-2xl font-bold text-white mb-3">
                  You're out at {checkInVenueName}!
                </h2>
                <p className="text-white/90 text-base">
                  Your <span className="font-semibold">{privacyLabel}</span> can now see where you are tonight.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-3">
                  You're planning to go out{checkInNeighborhood ? ` in ${checkInNeighborhood}` : ''}!
                </h2>
                <p className="text-white/90 text-base">
                  Your <span className="font-semibold">{privacyLabel}</span> can now see you're planning to go out.
                </p>
              </>
            )}
          </div>

          {/* Tap to dismiss hint */}
          <p className="text-center text-white/60 text-sm mt-4">
            Tap anywhere to dismiss
          </p>
        </div>
      </div>
    </div>
  );
}
