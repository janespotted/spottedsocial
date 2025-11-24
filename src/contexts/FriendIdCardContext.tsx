import { createContext, useContext, useState, ReactNode } from 'react';

export interface FriendCardData {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  venueName?: string;
  lat?: number;
  lng?: number;
  relationshipType?: 'close' | 'direct' | 'mutual';
}

interface FriendIdCardContextType {
  selectedFriend: FriendCardData | null;
  openFriendCard: (friend: FriendCardData) => void;
  closeFriendCard: () => void;
}

const FriendIdCardContext = createContext<FriendIdCardContextType | undefined>(undefined);

export function FriendIdCardProvider({ children }: { children: ReactNode }) {
  const [selectedFriend, setSelectedFriend] = useState<FriendCardData | null>(null);

  const openFriendCard = (friend: FriendCardData) => {
    setSelectedFriend(friend);
  };

  const closeFriendCard = () => {
    setSelectedFriend(null);
  };

  return (
    <FriendIdCardContext.Provider value={{ selectedFriend, openFriendCard, closeFriendCard }}>
      {children}
    </FriendIdCardContext.Provider>
  );
}

export function useFriendIdCard() {
  const context = useContext(FriendIdCardContext);
  if (context === undefined) {
    throw new Error('useFriendIdCard must be used within a FriendIdCardProvider');
  }
  return context;
}
