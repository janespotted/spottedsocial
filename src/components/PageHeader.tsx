import { ReactNode, useRef, useEffect, useState } from 'react';
import { Search, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { haptic } from '@/lib/haptics';
import { CityBadge } from '@/components/CityBadge';
import { NotificationBadge } from '@/components/NotificationBadge';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
  showSearch?: boolean;
  showNotifications?: boolean;
  showProfileLogo?: boolean;
  enableAdminGesture?: boolean;
  onSearchPress?: () => void;
}

export function PageHeader({
  title,
  subtitle,
  rightActions,
  showSearch = true,
  showNotifications = true,
  showProfileLogo = true,
  enableAdminGesture = false,
  onSearchPress,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { openCheckIn } = useCheckIn();

  // Admin triple-tap gesture
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!enableAdminGesture || !user) return;
    supabase.rpc('has_role', { user_id: user.id, role: 'admin' } as any)
      .then(({ data, error }) => {
        if (error) console.error('[Admin] has_role error:', error);
        setIsAdmin(data === true);
      });
  }, [user, enableAdminGesture]);

  const handleWordmarkTap = () => {
    if (!enableAdminGesture) return;
    // Allow taps to register even before admin check resolves — just block navigation
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      if (isAdmin) {
        haptic.light();
        navigate('/demo-settings');
      }
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 800);
  };

  const wordmarkProps = enableAdminGesture
    ? { onClick: handleWordmarkTap }
    : {};

  return (
    <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur pt-[max(env(safe-area-inset-top),12px)]">
      <div className="flex items-start justify-between px-5 pt-3 pb-3">
        {/* Left: Wordmark + Title + Subtitle */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span
              {...wordmarkProps}
              className="text-[30px] tracking-[0.35em] text-white select-none"
              style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}
            >
              Spotted
            </span>
            <CityBadge />
          </div>
          {title && (
            <h2 className="text-3xl font-bold text-white">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-white/50 text-sm mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 pt-1">
          {showSearch && (
            <button
              onClick={onSearchPress}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
          )}
          {showNotifications && (
            <button
              onClick={() => navigate('/messages', { state: { activeTab: 'activity' } })}
              className="relative w-10 h-10 rounded-full bg-[#a855f7] text-white flex items-center justify-center hover:bg-[#a855f7]/90 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <NotificationBadge count={unreadCount} />
            </button>
          )}
          {showProfileLogo && (
            <button
              onClick={openCheckIn}
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Go live" className="h-12 w-12 object-contain" />
            </button>
          )}
        </div>
      </div>

      {/* Right actions slot (e.g., neighborhood dropdown) */}
      {rightActions && (
        <div className="px-5 pb-3">{rightActions}</div>
      )}
    </div>
  );
}
