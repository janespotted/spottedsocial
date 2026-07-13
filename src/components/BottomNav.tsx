import { memo, useEffect, useRef } from 'react';
import { Home, MapPin, BarChart3, MessageSquare } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import spottedLogo from '@/assets/spotted-s-logo.png';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/leaderboard', icon: BarChart3, label: 'Leaderboard' },
  { to: '/map', icon: MapPin, label: 'Map', isCenter: true },
  { to: '/messages', icon: MessageSquare, label: 'Chat' },
  { to: '/profile', icon: null, label: 'S', isSpecial: true },
];

export const BottomNav = memo(function BottomNav() {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // Pin the nav to the PHYSICAL screen bottom. With Keyboard.resize:'native'
  // the webview shrinks (late) when the keyboard opens, which made this
  // fixed bottom-0 nav ride up and park on top of the keyboard. Compensate
  // by translating it down by exactly the amount the viewport shrank, so it
  // visually never moves — the keyboard simply slides over it. No hiding,
  // no unmounting, no layout shift, in either direction.
  useEffect(() => {
    const el = navRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    let baseline = vv.height;

    const sync = () => {
      baseline = Math.max(baseline, vv.height);
      const resized = Math.max(0, Math.round(baseline - vv.height));
      el.style.transform = resized > 0 ? `translate3d(0, ${resized}px, 0)` : '';
    };

    const onOrientationChange = () => {
      baseline = 0;
    };

    sync();
    vv.addEventListener('resize', sync);
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      vv.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', onOrientationChange);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 left-0 right-0 bg-background border-t border-white/8 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map(({ to, icon: Icon, label, isCenter, isSpecial }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full transition-all',
                isActive 
                  ? 'text-[#d4ff00]' 
                  : 'text-white/40 hover:text-white/60',
                isCenter && isActive && 'scale-110'
              )}
            >
              {isSpecial ? (
                <img 
                  src={spottedLogo}
                  alt="Profile"
                  className={cn(
                    'h-10 w-10 object-contain transition-all',
                    isActive && 'drop-shadow-[0_0_4px_rgba(212,255,0,0.4)]'
                  )}
                />
              ) : Icon ? (
                <>
                  <Icon 
                    className={cn(
                      'h-6 w-6 transition-all',
                      isActive && 'drop-shadow-[0_0_4px_rgba(212,255,0,0.4)]',
                      isCenter && 'h-7 w-7'
                    )} 
                  />
                  <span className="text-xs mt-0.5">{label}</span>
                </>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
});
