import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

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
  const { user } = useAuth();
  const navigate = useNavigate();

  const openFriendCard = (friend: FriendCardData) => {
    if (user && friend.userId === user.id) {
      navigate('/profile');
      return;
    }
    // Dismiss any open venue card so they don't stack
    window.dispatchEvent(new CustomEvent('dismissVenueCard'));
    setSelectedFriend(friend);
    // Track profile view for FOMO notification
    import('@/lib/fomo-notifications').then(({ notifyProfileViewed }) => {
      notifyProfileViewed(friend.userId);
    }).catch(() => {});
  };

  const closeFriendCard = () => {
    setSelectedFriend(null);
  };

  // Listen for dismiss requests from venue card
  useEffect(() => {
    const handler = () => setSelectedFriend(null);
    window.addEventListener('dismissFriendCard', handler);
    return () => window.removeEventListener('dismissFriendCard', handler);
  }, []);

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
