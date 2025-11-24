import { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from '@/hooks/use-toast';

interface MeetUpContextType {
  recipientUserId: string | null;
  recipientDisplayName: string | null;
  recipientAvatarUrl: string | null;
  showConfirmation: boolean;
  sendMeetUpNotification: (userId: string, displayName: string, avatarUrl: string | null) => Promise<void>;
  closeConfirmation: () => void;
}

const MeetUpContext = createContext<MeetUpContextType | undefined>(undefined);

export function MeetUpProvider({ children }: { children: ReactNode }) {
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientDisplayName, setRecipientDisplayName] = useState<string | null>(null);
  const [recipientAvatarUrl, setRecipientAvatarUrl] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { user } = useAuth();

  const sendMeetUpNotification = async (userId: string, displayName: string, avatarUrl: string | null) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to send meet up notifications",
        variant: "destructive"
      });
      return;
    }

    try {
      // Check for recent notifications to prevent spam
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id')
        .eq('sender_id', user.id)
        .eq('receiver_id', userId)
        .eq('type', 'meetup_request')
        .eq('is_read', false)
        .gte('created_at', fiveMinutesAgo);

      if (checkError) throw checkError;

      if (recentNotifications && recentNotifications.length > 0) {
        toast({
          title: "Already sent",
          description: `You just sent a meet up to ${displayName}.`,
        });
        return;
      }

      // Get sender's display name
      const { data: senderProfile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const senderName = senderProfile?.display_name || 'Someone';
      const message = `${senderName} wants to meet up with you`;

      // Insert notification
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          sender_id: user.id,
          receiver_id: userId,
          type: 'meetup_request',
          message: message,
          is_read: false
        });

      if (insertError) throw insertError;

      // Show confirmation card
      setRecipientUserId(userId);
      setRecipientDisplayName(displayName);
      setRecipientAvatarUrl(avatarUrl);
      setShowConfirmation(true);
      
      console.log('Meet Up notification sent to:', displayName);
    } catch (error) {
      console.error('Error sending meet up notification:', error);
      toast({
        title: "Error",
        description: "Something went wrong sending your meet up. Try again.",
        variant: "destructive"
      });
    }
  };

  const closeConfirmation = () => {
    setShowConfirmation(false);
    setRecipientUserId(null);
    setRecipientDisplayName(null);
    setRecipientAvatarUrl(null);
  };

  return (
    <MeetUpContext.Provider
      value={{
        recipientUserId,
        recipientDisplayName,
        recipientAvatarUrl,
        showConfirmation,
        sendMeetUpNotification,
        closeConfirmation,
      }}
    >
      {children}
    </MeetUpContext.Provider>
  );
}

export function useMeetUp() {
  const context = useContext(MeetUpContext);
  if (context === undefined) {
    throw new Error('useMeetUp must be used within a MeetUpProvider');
  }
  return context;
}
