import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { cn } from '@/lib/utils';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { MessagesTab } from '@/components/messages/MessagesTab';
import { YapTab } from '@/components/messages/YapTab';
import { ActivityTab } from '@/components/messages/ActivityTab';

type TabType = 'messages' | 'yap' | 'activity';

interface PreselectedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export default function Messages() {
  const { openCheckIn } = useCheckIn();
  useAutoVenueTracking(); // Trigger auto-venue tracking on messages view
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('messages');
  const [preselectedUser, setPreselectedUser] = useState<PreselectedUser | null>(null);

  useEffect(() => {
    // Check if we have a preselected user from navigation state
    if (location.state?.preselectedUser) {
      setPreselectedUser(location.state.preselectedUser);
      setActiveTab('messages');
    }
  }, [location.state]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-light tracking-[0.3em] text-white mb-1">Spotted</h1>
            <p className="text-white/60 text-sm">Everything disappears by 5am</p>
          </div>
          <button 
            onClick={openCheckIn}
            className="hover:scale-110 transition-transform"
          >
            <img src={spottedLogo} alt="Check In" className="h-10 w-10 object-contain" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-around px-6 pb-4">
          <button
            onClick={() => setActiveTab('messages')}
            className={cn(
              'relative pb-2 text-lg font-medium transition-colors',
              activeTab === 'messages' 
                ? 'text-white' 
                : 'text-white/40'
            )}
          >
            Messages
            {activeTab === 'messages' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('yap')}
            className={cn(
              'relative pb-2 text-lg font-medium transition-colors',
              activeTab === 'yap' 
                ? 'text-white' 
                : 'text-white/40'
            )}
          >
            Yap
            {activeTab === 'yap' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={cn(
              'relative pb-2 text-lg font-medium transition-colors',
              activeTab === 'activity' 
                ? 'text-white' 
                : 'text-white/40'
            )}
          >
            Activity
            {activeTab === 'activity' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-6">
        {activeTab === 'messages' && (
          <MessagesTab 
            preselectedUser={preselectedUser}
            onClearPreselection={() => setPreselectedUser(null)}
          />
        )}
        {activeTab === 'yap' && <YapTab />}
        {activeTab === 'activity' && <ActivityTab />}
      </div>
    </div>
  );
}
