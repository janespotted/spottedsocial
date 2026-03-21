import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Undo2, MessageCircle } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import spottedLogo from '@/assets/spotted-s-logo.png';

export function VenueInviteConfirmation() {
  const { showConfirmation, invitedFriends, venueName, closeConfirmation } = useVenueInvite();
  const { openFriendCard } = useFriendIdCard();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (showConfirmation) {
      // Continuous confetti animation from both sides for 3 seconds
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ['#a855f7', '#d4ff00', '#ffffff'],
          zIndex: 9999
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ['#a855f7', '#d4ff00', '#ffffff'],
          zIndex: 9999
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };

      frame();
    }
  }, [showConfirmation]);

  const handleOpenChat = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleUndo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      closeConfirmation();
      return;
    }

    try {
      // Delete the sent notifications
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('sender_id', user.id)
        .eq('type', 'venue_invite')
        .in('receiver_id', invitedFriends.map(f => f.id));

      if (error) throw error;

      const friendsText = invitedFriends.length === 1
        ? invitedFriends[0].displayName
        : `${invitedFriends.length} friends`;

      toast({
        title: "Undo successful",
        description: `Venue invite to ${friendsText} was canceled.`,
      });
      
      haptic.light();
    } catch (error) {
      console.error('Error undoing venue invite:', error);
      toast({
        title: "Error",
        description: "Couldn't undo the invite. Try again.",
        variant: "destructive"
      });
    }

    closeConfirmation();
  };

  const handleAvatarClick = (e: React.MouseEvent, friend: typeof invitedFriends[0]) => {
    e.stopPropagation();
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
      className="fixed inset-0 z-[600] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="w-[90%] max-w-md">
        <div className="relative bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6b21a8] rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.6),0_0_40px_rgba(124,58,237,0.8)] animate-scale-in">
          {/* Friend Avatar - Top Left */}
          {invitedFriends.length > 0 && (
            <button
              onClick={(e) => handleAvatarClick(e, invitedFriends[0])}
              className="absolute top-4 left-4 cursor-pointer hover:scale-110 transition-transform"
            >
              <Avatar className="w-12 h-12 border-2 border-[#2d1b4e] shadow-lg">
                <AvatarImage src={invitedFriends[0].avatarUrl || undefined} />
                <AvatarFallback className="bg-[#a855f7] text-white">
                  {invitedFriends[0].displayName[0]}
                </AvatarFallback>
              </Avatar>
            </button>
          )}

          {/* Spotted Logo - Top Right */}
          <img 
            src={spottedLogo} 
            alt="Spotted" 
            className="absolute top-4 right-4 w-12 h-12"
          />

          {/* Main Content */}
          <div className="text-center pt-4">
            {/* Bouncing Emoji */}
            <div className="text-7xl mb-4 animate-bounce">🥳</div>
            
            {/* Message */}
            <h2 className="text-2xl font-bold text-white mb-2">
              Invites Sent!
            </h2>
            <p className="text-white/80 mb-8">
              You invited <span className="text-[#d4ff00] font-semibold">{friendsText}</span>
              {' '}to{' '}
              <span className="text-[#d4ff00] font-semibold">{venueName}</span>
            </p>

            {/* Circular Action Buttons */}
            <div className="flex justify-center items-center gap-8">
              {/* Undo Button */}
              <button
                onClick={handleUndo}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 shadow-lg">
                  <Undo2 className="w-7 h-7 text-white" />
                </div>
                <span className="text-white/90 text-xs font-medium">Undo</span>
              </button>
              
              {/* Chat Button */}
              <button
                onClick={handleOpenChat}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 shadow-lg">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
                <span className="text-white/90 text-xs font-medium">Chat</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
