import { createContext, useContext, useState, ReactNode } from 'react';

interface MeetUpContextType {
  recipientUserId: string | null;
  recipientDisplayName: string | null;
  recipientAvatarUrl: string | null;
  showConfirmation: boolean;
  sendMeetUpNotification: (userId: string, displayName: string, avatarUrl: string | null) => void;
  closeConfirmation: () => void;
}

const MeetUpContext = createContext<MeetUpContextType | undefined>(undefined);

export function MeetUpProvider({ children }: { children: ReactNode }) {
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientDisplayName, setRecipientDisplayName] = useState<string | null>(null);
  const [recipientAvatarUrl, setRecipientAvatarUrl] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const sendMeetUpNotification = (userId: string, displayName: string, avatarUrl: string | null) => {
    setRecipientUserId(userId);
    setRecipientDisplayName(displayName);
    setRecipientAvatarUrl(avatarUrl);
    setShowConfirmation(true);

    // TODO: Send actual notification to backend when ready
    console.log('Meet Up notification sent to:', displayName);
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
