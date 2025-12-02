import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
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
  const { openFriendCard } = useFriendIdCard();
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
            id: firstFriend.id,
            display_name: firstFriend.displayName,
            avatar_url: firstFriend.avatarUrl
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

  const handleAvatarClick = (friend: typeof invitedFriends[0]) => {
    closeConfirmation();
    openFriendCard({
      userId: friend.id,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      relationshipType: 'direct'
    });
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
      className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md bg-gradient-to-br from-[#6b21a8] via-[#581c87] to-[#4c1d95] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
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
            <button
              key={friend.id}
              onClick={() => handleAvatarClick(friend)}
              className="cursor-pointer hover:scale-110 transition-transform"
            >
              <Avatar className="w-12 h-12 border-2 border-[#2d1b4e]">
                <AvatarImage src={friend.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.displayName}`} />
                <AvatarFallback className="bg-[#a855f7] text-white">
                  {friend.displayName[0]}
                </AvatarFallback>
              </Avatar>
            </button>
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
