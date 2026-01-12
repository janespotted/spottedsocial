import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logEvent } from '@/lib/event-logger';

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
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Process pending invite on sign in (covers email confirmation and login)
        if (event === 'SIGNED_IN' && session?.user) {
          // Log user login event
          logEvent('user_login', { method: 'auth_state_change' });
          
          // Defer to avoid Supabase deadlock
          setTimeout(() => {
            processPendingInvite(session.user.id);
          }, 0);
          
          // Use window.location for navigation to avoid hook dependency
          // This ensures we redirect even on initial mount
          if (window.location.pathname === '/auth') {
            window.location.href = '/';
          }
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
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
