import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { useNotifications } from '@/contexts/NotificationsContext';
import { cn } from '@/lib/utils';
import { MessagesTab } from '@/components/messages/MessagesTab';
import { YapTab } from '@/components/messages/YapTab';
import { ActivityTab } from '@/components/messages/ActivityTab';
import { PageHeader } from '@/components/PageHeader';
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
  const { unreadCount, markAllAsRead } = useNotifications();
  useAutoVenueTracking(); // Trigger auto-venue tracking on messages view
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('yap');
  const [preselectedUser, setPreselectedUser] = useState<PreselectedUser | null>(null);
  const [dmSource, setDmSource] = useState<string | null>(null);
  const [yapVenueName, setYapVenueName] = useState<string | undefined>(undefined);
  const [yapIsPrivateParty, setYapIsPrivateParty] = useState(false);
  const [yapNavKey, setYapNavKey] = useState(0);
  const [showFriendSearch, setShowFriendSearch] = useState(false);

  // Mark all notifications as read when viewing the Activity tab
  useEffect(() => {
    if (activeTab === 'activity') {
      markAllAsRead();
    }
  }, [activeTab, markAllAsRead]);

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
      setDmSource(state.source || null);
      setActiveTab('messages');
      navigate(location.pathname, { replace: true, state: {} });
    } else if (state?.activeTab) {
      setActiveTab(state.activeTab);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.key]);

  return (
    <div className="bg-gradient-to-b from-[#1a0f2e] to-[#110a24] pb-24">
      {/* Header */}
      <PageHeader
        title=""
        subtitle="Everything disappears by 5am"
        onSearchPress={() => setShowFriendSearch(true)}
      />

      {/* Tabs */}
      <div className="flex items-center px-5 pb-4">
        <button
          onClick={() => setActiveTab('yap')}
          className={cn(
            'relative flex-1 pb-2 text-lg font-semibold text-center transition-colors',
            activeTab === 'yap' ? 'text-white' : 'text-white/40'
          )}
        >
          Yap
          {activeTab === 'yap' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#d4ff00]" />}
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={cn(
            'relative flex-1 pb-2 text-lg font-semibold text-center transition-colors',
            activeTab === 'messages' ? 'text-white' : 'text-white/40'
          )}
        >
          DMs
          {activeTab === 'messages' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#d4ff00]" />}
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={cn(
            'relative flex-1 pb-2 text-lg font-semibold text-center transition-colors',
            activeTab === 'activity' ? 'text-white' : 'text-white/40'
          )}
        >
          Activity
          {activeTab === 'activity' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#d4ff00]" />}
        </button>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-6">
        {activeTab === 'messages' && (
          <MessagesTab
            preselectedUser={preselectedUser}
            onClearPreselection={() => { setPreselectedUser(null); setDmSource(null); }}
            source={dmSource}
          />
        )}
        {activeTab === 'yap' && <YapTab key={yapNavKey} venueName={yapVenueName} isPrivatePartyNav={yapIsPrivateParty} />}
        {activeTab === 'activity' && <ActivityTab />}
      </div>

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
  );
}
