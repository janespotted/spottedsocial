import { createContext, useContext, useState, ReactNode } from 'react';

interface ImDownContextType {
  showConfirmation: boolean;
  senderUserId: string | null;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  acceptType: 'meet_up' | 'venue_invite' | null;
  venueName: string | null;
  triggerConfirmation: (
    userId: string,
    displayName: string,
    avatarUrl: string | null,
    type: 'meet_up' | 'venue_invite',
    venue?: string
  ) => void;
  closeConfirmation: () => void;
}

const ImDownContext = createContext<ImDownContextType | undefined>(undefined);

export function ImDownProvider({ children }: { children: ReactNode }) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [senderUserId, setSenderUserId] = useState<string | null>(null);
  const [senderDisplayName, setSenderDisplayName] = useState<string | null>(null);
  const [senderAvatarUrl, setSenderAvatarUrl] = useState<string | null>(null);
  const [acceptType, setAcceptType] = useState<'meet_up' | 'venue_invite' | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);

  const triggerConfirmation = (
    userId: string,
    displayName: string,
    avatarUrl: string | null,
    type: 'meet_up' | 'venue_invite',
    venue?: string
  ) => {
    setSenderUserId(userId);
    setSenderDisplayName(displayName);
    setSenderAvatarUrl(avatarUrl);
    setAcceptType(type);
    setVenueName(venue || null);
    setShowConfirmation(true);
  };

  const closeConfirmation = () => {
    setShowConfirmation(false);
    setSenderUserId(null);
    setSenderDisplayName(null);
    setSenderAvatarUrl(null);
    setAcceptType(null);
    setVenueName(null);
  };

  return (
    <ImDownContext.Provider
      value={{
        showConfirmation,
        senderUserId,
        senderDisplayName,
        senderAvatarUrl,
        acceptType,
        venueName,
        triggerConfirmation,
        closeConfirmation,
      }}
    >
      {children}
    </ImDownContext.Provider>
  );
}

export function useImDown() {
  const context = useContext(ImDownContext);
  if (context === undefined) {
    throw new Error('useImDown must be used within an ImDownProvider');
  }
  return context;
}
