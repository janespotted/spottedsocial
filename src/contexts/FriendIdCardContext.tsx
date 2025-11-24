import { createContext, useContext, useState, ReactNode } from 'react';

interface FriendIdCardContextType {
  selectedUserId: string | null;
  openFriendCard: (userId: string) => void;
  closeFriendCard: () => void;
}

const FriendIdCardContext = createContext<FriendIdCardContextType | undefined>(undefined);

export function FriendIdCardProvider({ children }: { children: ReactNode }) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const openFriendCard = (userId: string) => {
    setSelectedUserId(userId);
  };

  const closeFriendCard = () => {
    setSelectedUserId(null);
  };

  return (
    <FriendIdCardContext.Provider value={{ selectedUserId, openFriendCard, closeFriendCard }}>
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
