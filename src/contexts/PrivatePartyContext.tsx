import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PrivatePartyData {
  hostId: string;
  hostName: string;
  hostAvatarUrl: string | null;
  neighborhood: string;
  friendsAtParty?: { userId: string; displayName: string; avatarUrl: string | null }[];
}

interface PrivatePartyContextType {
  showPrivatePartyCard: boolean;
  partyData: PrivatePartyData | null;
  openPrivatePartyCard: (data: PrivatePartyData) => void;
  closePrivatePartyCard: () => void;
}

const PrivatePartyContext = createContext<PrivatePartyContextType | undefined>(undefined);

export function PrivatePartyProvider({ children }: { children: ReactNode }) {
  const [showPrivatePartyCard, setShowPrivatePartyCard] = useState(false);
  const [partyData, setPartyData] = useState<PrivatePartyData | null>(null);

  const openPrivatePartyCard = (data: PrivatePartyData) => {
    setPartyData(data);
    setShowPrivatePartyCard(true);
  };

  const closePrivatePartyCard = () => {
    setShowPrivatePartyCard(false);
    setPartyData(null);
  };

  return (
    <PrivatePartyContext.Provider
      value={{
        showPrivatePartyCard,
        partyData,
        openPrivatePartyCard,
        closePrivatePartyCard,
      }}
    >
      {children}
    </PrivatePartyContext.Provider>
  );
}

export function usePrivateParty() {
  const context = useContext(PrivatePartyContext);
  if (!context) {
    throw new Error('usePrivateParty must be used within a PrivatePartyProvider');
  }
  return context;
}
