import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logEvent } from '@/lib/event-logger';
import { isNativePlatform } from '@/lib/platform';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Process pending invite code from localStorage
const processPendingInvite = async (userId: string) => {
  const pendingInvite = localStorage.getItem('pending_invite_code');
  if (!pendingInvite) return;

  try {
    const { data, error } = await supabase.rpc('process_invite_code', {
      invite_code: pendingInvite,
      new_user_id: userId,
    });

    if (error) {
      console.error('Error processing invite:', error);
      return;
    }

    // Type assertion since RPC returns Json type
    const result = data as { success: boolean; inviter_name?: string; error?: string } | null;
    if (result?.success && result.inviter_name) {
      toast.success(`You're now friends with ${result.inviter_name}! 🎉`);
    } else if (result?.error === 'User already used an invite') {
      // Silent - user already processed this or another invite
    }
  } catch (error) {
    console.error('Error processing invite code:', error);
  } finally {
    // Always clear the pending invite after attempting to process
    localStorage.removeItem('pending_invite_code');
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthDebug] useEffect mount, pathname:', window.location.pathname);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[AuthDebug] onAuthStateChange fired');
        console.log('[AuthDebug]   event:', event);
        console.log('[AuthDebug]   session user:', session?.user?.id ?? 'null');
        console.log('[AuthDebug]   pathname:', window.location.pathname);

        const appleDebug = sessionStorage.getItem('apple_auth_debug');
        if (appleDebug) {
          console.log('[AppleAuth] Pre-redirect state:', appleDebug);
          console.log('[AppleAuth] Return event:', event, 'session:', !!session);
          sessionStorage.removeItem('apple_auth_debug');
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        console.log('[AuthDebug]   loading set to false, user:', session?.user?.id ?? 'null');

        if (event === 'SIGNED_IN' && session?.user) {
          logEvent('user_login', { method: 'auth_state_change' });
          
          setTimeout(() => {
            processPendingInvite(session.user.id);
          }, 0);
          
          const path = window.location.pathname;
          console.log('[AuthDebug]   SIGNED_IN navigation check, path:', path);
          if (path === '/auth' || path.startsWith('/~oauth') || path === '/') {
            console.log('[AuthDebug]   Navigating to /');
            if (isNativePlatform()) {
              window.history.replaceState(null, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            } else {
              window.location.href = '/';
            }
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    if (isNativePlatform()) {
      window.history.replaceState(null, '', '/auth');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      window.location.href = '/auth';
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
