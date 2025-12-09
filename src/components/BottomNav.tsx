import { Home, MapPin, BarChart3, MessageSquare } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import spottedLogo from '@/assets/spotted-s-logo.png';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/leaderboard', icon: BarChart3, label: 'Leaderboard' },
  { to: '/map', icon: MapPin, label: 'Map', isCenter: true },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/profile', icon: null, label: 'S', isSpecial: true },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#2d1b4e] to-[#1a0f2e] border-t border-[#a855f7]/20 backdrop-blur-lg z-50"
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
                    isActive && 'drop-shadow-[0_0_8px_rgba(212,255,0,0.8)]'
                  )}
                />
              ) : Icon ? (
                <>
                  <Icon 
                    className={cn(
                      'h-6 w-6 transition-all',
                      isActive && 'drop-shadow-[0_0_8px_rgba(212,255,0,0.8)]',
                      isCenter && 'h-7 w-7'
                    )} 
                  />
                  {!isCenter && (
                    <span className="text-xs mt-0.5">{label}</span>
                  )}
                </>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
