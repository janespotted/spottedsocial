import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import confetti from 'canvas-confetti';
import spottedLogo from '@/assets/spotted-s-logo.png';

export function VenueInviteConfirmation() {
  const { showConfirmation, invitedFriends, venueName, closeConfirmation } = useVenueInvite();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (showConfirmation) {
      // Trigger confetti animation
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#a855f7', '#d4ff00', '#ffffff']
      });
    }
  }, [showConfirmation]);

  const handleOpenChat = () => {
    if (invitedFriends.length > 0) {
      const firstFriend = invitedFriends[0];
      navigate('/messages', {
        state: {
          preselectedUser: {
            userId: firstFriend.id,
            displayName: firstFriend.displayName,
            avatarUrl: firstFriend.avatarUrl
          }
        }
      });
      closeConfirmation();
    }
  };

  const handleUndo = async () => {
    if (!user) return;

    try {
      // Delete the sent notifications
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('sender_id', user.id)
        .eq('type', 'venue_invite')
        .in('receiver_id', invitedFriends.map(f => f.id));

      if (error) throw error;

      haptic.light();
      closeConfirmation();
    } catch (error) {
      console.error('Error undoing venue invite:', error);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeConfirmation();
    }
  };

  if (!showConfirmation) return null;

  const friendsText = invitedFriends.length === 1
    ? invitedFriends[0].displayName
    : invitedFriends.length === 2
    ? `${invitedFriends[0].displayName} and ${invitedFriends[1].displayName}`
    : `${invitedFriends[0].displayName}, ${invitedFriends[1].displayName}, +${invitedFriends.length - 2} more`;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-[400px] bg-gradient-to-br from-[#a855f7]/20 to-[#d4ff00]/20 backdrop-blur-xl rounded-3xl p-6 border-2 border-[#a855f7] shadow-[0_0_40px_rgba(168,85,247,0.6)] animate-in fade-in zoom-in duration-300">
        {/* Spotted Logo */}
        <div className="flex justify-center mb-4">
          <img src={spottedLogo} alt="Spotted" className="w-12 h-12" />
        </div>

        {/* Main Message */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Invites Sent!
          </h2>
          <p className="text-white/80">
            You invited <span className="text-[#d4ff00] font-semibold">{friendsText}</span>
            {' '}to{' '}
            <span className="text-[#d4ff00] font-semibold">{venueName}</span>
          </p>
        </div>

        {/* Friend Avatars */}
        <div className="flex justify-center -space-x-3 mb-6">
          {invitedFriends.slice(0, 3).map((friend) => (
            <Avatar key={friend.id} className="w-12 h-12 border-2 border-[#2d1b4e]">
              <AvatarImage src={friend.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.displayName}`} />
              <AvatarFallback className="bg-[#a855f7] text-white">
                {friend.displayName[0]}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleOpenChat}
            className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 text-white font-semibold"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Chat with {invitedFriends[0]?.displayName}
          </Button>
          
          <Button
            onClick={handleUndo}
            variant="outline"
            className="w-full border-[#a855f7]/40 text-white hover:bg-[#a855f7]/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Undo
          </Button>
        </div>
      </div>
    </div>
  );
}
