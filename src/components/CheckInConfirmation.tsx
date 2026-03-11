import { useCheckIn } from '@/contexts/CheckInContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import spottedLogo from '@/assets/spotted-s-logo.png';

export function CheckInConfirmation() {
  const { 
    showCheckInConfirmation, 
    checkInConfirmationType,
    checkInVenueName,
    checkInNeighborhood,
    checkInPrivacyLevel,
    closeCheckInConfirmation 
  } = useCheckIn();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');

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
    }
  }, [user, showCheckInConfirmation]);

  useEffect(() => {
    if (!showCheckInConfirmation) return;

    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, [showCheckInConfirmation]);

  const handleBackdropClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.target === e.currentTarget) {
      handleDismissAndNavigate();
    }
  };

  const getPrivacyLabel = (level: string): string => {
    switch (level) {
      case 'close_friends': return 'close friends';
      case 'all_friends': return 'friends';
      case 'mutual_friends': return 'mutual friends';
      default: return 'friends';
    }
  };

  if (!showCheckInConfirmation) return null;

  const isOut = checkInConfirmationType === 'out';
  const emoji = isOut ? '🥳' : '🤔';
  const privacyLabel = getPrivacyLabel(checkInPrivacyLevel || 'all_friends');

  return (
    <div 
      className="fixed inset-0 z-[600] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="w-[90%] max-w-md">
        <div className="relative bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
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

          <div className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center">
            <img src={spottedLogo} alt="Spotted" className="w-full h-full object-contain" />
          </div>

          <div className="flex flex-col items-center text-center mt-4 mb-6">
            <div className="text-7xl mb-4 animate-bounce">{emoji}</div>
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

          <p className="text-center text-white/60 text-sm mt-4">
            Tap anywhere to dismiss
          </p>
        </div>
      </div>
    </div>
  );
}
