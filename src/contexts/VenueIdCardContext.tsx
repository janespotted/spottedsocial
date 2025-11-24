import { createContext, useContext, useState, ReactNode } from 'react';

interface VenueIdCardContextType {
  selectedVenueId: string | null;
  openVenueCard: (venueId: string) => void;
  closeVenueCard: () => void;
}

const VenueIdCardContext = createContext<VenueIdCardContextType | undefined>(undefined);

export function VenueIdCardProvider({ children }: { children: ReactNode }) {
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const openVenueCard = (venueId: string) => {
    setSelectedVenueId(venueId);
  };

  const closeVenueCard = () => {
    setSelectedVenueId(null);
  };

  return (
    <VenueIdCardContext.Provider value={{ selectedVenueId, openVenueCard, closeVenueCard }}>
      {children}
    </VenueIdCardContext.Provider>
  );
}

export function useVenueIdCard() {
  const context = useContext(VenueIdCardContext);
  if (context === undefined) {
    throw new Error('useVenueIdCard must be used within a VenueIdCardProvider');
  }
  return context;
}
