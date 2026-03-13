import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { useNotifications } from '@/contexts/NotificationsContext';
import { cn } from '@/lib/utils';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { MessagesTab } from '@/components/messages/MessagesTab';
import { YapTab } from '@/components/messages/YapTab';
import { ActivityTab } from '@/components/messages/ActivityTab';
import { CityBadge } from '@/components/CityBadge';
import { Bell, Search } from 'lucide-react';
import { NotificationBadge } from '@/components/NotificationBadge';
import { FriendSearchModal } from '@/components/FriendSearchModal';

type TabType = 'messages' | 'yap' | 'activity';

interface PreselectedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export default function Messages() {
  const { openCheckIn } = useCheckIn();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  useAutoVenueTracking(); // Trigger auto-venue tracking on messages view
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('messages');
  const [preselectedUser, setPreselectedUser] = useState<PreselectedUser | null>(null);
  const [yapVenueName, setYapVenueName] = useState<string | undefined>(undefined);
  const [yapIsPrivateParty, setYapIsPrivateParty] = useState(false);
  const [yapNavKey, setYapNavKey] = useState(0);
  const [showFriendSearch, setShowFriendSearch] = useState(false);

  useEffect(() => {
    const state = location.state as any;
    const lsVenue = localStorage.getItem('yap_nav_venue');
    const lsPrivateParty = localStorage.getItem('yap_nav_private_party') === 'true';

    if (state?.venueName || lsVenue) {
      const venue = state?.venueName || lsVenue;
      const isPrivateParty = state?.isPrivateParty ?? lsPrivateParty;
      setYapVenueName(venue);
      setYapIsPrivateParty(!!isPrivateParty);
      setYapNavKey(prev => prev + 1);
      setActiveTab('yap');
      localStorage.removeItem('yap_nav_venue');
      localStorage.removeItem('yap_nav_private_party');
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.preselectedUser) {
      setPreselectedUser(state.preselectedUser);
      setActiveTab('messages');
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.activeTab) {
      setActiveTab(state.activeTab);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.key]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
        <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-start justify-between px-6 pt-3 pb-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
              <CityBadge />
            </div>
            <p className="text-white/60 text-sm">Everything disappears by 5am</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFriendSearch(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
              aria-label="Search friends"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
              aria-label="View activity"
            >
              <Bell className="w-5 h-5" />
              <NotificationBadge count={unreadCount} />
            </button>
            <button 
              onClick={openCheckIn}
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Go live" className="h-12 w-12 object-contain" />
            </button>
          </div>
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
        {activeTab === 'yap' && <YapTab key={yapNavKey} venueName={yapVenueName} isPrivatePartyNav={yapIsPrivateParty} />}
        {activeTab === 'activity' && <ActivityTab />}
      </div>

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
  );
}
