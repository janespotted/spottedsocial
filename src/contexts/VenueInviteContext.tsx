import { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';

interface VenueInviteContextType {
  showInviteModal: boolean;
  showConfirmation: boolean;
  invitedFriends: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
  venueName: string | null;
  venueId: string | null;
  openInviteModal: (venueId: string, venueName: string) => void;
  closeInviteModal: () => void;
  sendInvites: (selectedFriends: Array<{ id: string; displayName: string; avatarUrl: string | null }>) => Promise<void>;
  closeConfirmation: () => void;
}

const VenueInviteContext = createContext<VenueInviteContextType | undefined>(undefined);

export function VenueInviteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [invitedFriends, setInvitedFriends] = useState<Array<{ id: string; displayName: string; avatarUrl: string | null }>>([]);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);

  const openInviteModal = (venueId: string, venueName: string) => {
    setVenueId(venueId);
    setVenueName(venueName);
    setShowInviteModal(true);
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
  };

  const sendInvites = async (selectedFriends: Array<{ id: string; displayName: string; avatarUrl: string | null }>) => {
    if (!user || !venueName || selectedFriends.length === 0) return;

    try {
      // Get current user's profile for first name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const senderFirstName = profile?.display_name.split(' ')[0] || 'Someone';

      // Send notification to each selected friend
      const notifications = selectedFriends.map(friend => ({
        sender_id: user.id,
        receiver_id: friend.id,
        type: 'venue_invite',
        message: `${senderFirstName} invited you to ${venueName}. Want to go?`
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) throw error;

      // Close modal and show confirmation
      setShowInviteModal(false);
      setInvitedFriends(selectedFriends);
      setShowConfirmation(true);
      
      // Success haptic
      haptic.success();
    } catch (error) {
      console.error('Error sending venue invites:', error);
      toast.error('Failed to send invites');
    }
  };

  const closeConfirmation = () => {
    setShowConfirmation(false);
    setInvitedFriends([]);
    setVenueName(null);
    setVenueId(null);
  };

  return (
    <VenueInviteContext.Provider 
      value={{ 
        showInviteModal, 
        showConfirmation, 
        invitedFriends, 
        venueName,
        venueId,
        openInviteModal,
        closeInviteModal,
        sendInvites, 
        closeConfirmation 
      }}
    >
      {children}
    </VenueInviteContext.Provider>
  );
}

export function useVenueInvite() {
  const context = useContext(VenueInviteContext);
  if (context === undefined) {
    throw new Error('useVenueInvite must be used within a VenueInviteProvider');
  }
  return context;
}
