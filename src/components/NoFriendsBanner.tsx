import { useState, useEffect } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface NoFriendsBannerProps {
  friendsCount: number;
}

export function NoFriendsBanner({ friendsCount }: NoFriendsBannerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('nofriends_banner_dismissed');
    setDismissed(wasDismissed === 'true');
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('nofriends_banner_dismissed', 'true');
  };

  // Don't show if user has friends or banner was dismissed
  if (friendsCount > 0 || dismissed) {
    return null;
  }

  return (
    <div className="mx-4 mt-4 mb-4 bg-gradient-to-r from-[#a855f7]/20 to-[#d4ff00]/10 border border-[#a855f7]/40 rounded-2xl p-4 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 rounded-full bg-[#a855f7]/30 flex items-center justify-center shrink-0">
          <UserPlus className="h-5 w-5 text-[#a855f7]" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white text-sm mb-1">
            Spotted is better with friends!
          </h3>
          <p className="text-white/60 text-xs mb-3">
            Invite your crew to see who's out tonight
          </p>
          <Button
            onClick={() => navigate('/friends')}
            size="sm"
            className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white text-xs h-8 rounded-full"
          >
            <UserPlus className="h-3 w-3 mr-1.5" />
            Invite Friends
          </Button>
        </div>
      </div>
    </div>
  );
}
