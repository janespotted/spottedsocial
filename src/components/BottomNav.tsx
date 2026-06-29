import { memo, useEffect } from 'react';
import { Home, MapPin, BarChart3, MessageSquare } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useInputFocusState, useInputFocus } from '@/contexts/InputFocusContext';
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
  const isInputFocused = useInputFocusState();
  const { setInputFocused } = useInputFocus();

  // Safety net: reset focus state on route change
  useEffect(() => {
    setInputFocused(false);
  }, [location.pathname, setInputFocused]);

  // Safety net: global blur listener catches cases where raw inputs
  // (not wrapped in shadcn Input/Textarea) don't call setInputFocused(false)
  useEffect(() => {
    const handleFocusOut = () => {
      // Small delay to allow focus to move to another input
      setTimeout(() => {
        const active = document.activeElement;
        const isInput = active instanceof HTMLInputElement || 
                        active instanceof HTMLTextAreaElement ||
                        active?.getAttribute('contenteditable') === 'true';
        if (!isInput) {
          setInputFocused(false);
        }
      }, 100);
    };

    document.addEventListener('focusout', handleFocusOut);
    return () => document.removeEventListener('focusout', handleFocusOut);
  }, [setInputFocused]);

  return (
    <nav 
      className={cn(
        "fixed bottom-0 left-0 right-0 bg-background border-t border-white/8 z-50 transition-transform duration-200 ease-out will-change-transform",
        isInputFocused && "translate-y-full"
      )}
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
