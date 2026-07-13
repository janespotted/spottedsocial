import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ActivityTab } from '@/components/messages/ActivityTab';
import { useNotifications } from '@/contexts/NotificationsContext';

export default function Activity() {
  const navigate = useNavigate();
  const { markAllAsRead } = useNotifications();

  useEffect(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  return (
    <div className="h-[100dvh] bg-gradient-to-b from-[#1a0f2e] to-[#110a24] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-white/[0.06] pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between px-4 h-11">
          <button
            onClick={() => navigate(-1)}
            className="text-white/60 hover:text-white transition-colors p-1 -ml-1"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-white font-semibold text-base">Activity</span>
          <div className="w-6" />
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-8">
        <ActivityTab />
      </div>
    </div>
  );
}
