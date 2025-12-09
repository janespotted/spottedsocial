import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      console.log('[AdminRoute] checkAdmin called');
      console.log('[AdminRoute] user:', user?.id, user?.email);
      
      if (!user) {
        console.log('[AdminRoute] No user, setting loading false');
        setLoading(false);
        return;
      }

      try {
        console.log('[AdminRoute] Calling has_role RPC for user:', user.id);
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        console.log('[AdminRoute] RPC response - data:', data, 'error:', error);

        if (error) {
          console.error('[AdminRoute] Error checking admin role:', error);
          setIsAdmin(false);
        } else {
          console.log('[AdminRoute] Setting isAdmin to:', data === true);
          setIsAdmin(data === true);
        }
      } catch (err) {
        console.error('[AdminRoute] Exception checking admin status:', err);
        setIsAdmin(false);
      } finally {
        console.log('[AdminRoute] Setting loading false');
        setLoading(false);
      }
    }

    console.log('[AdminRoute] useEffect triggered - authLoading:', authLoading);
    if (!authLoading) {
      checkAdmin();
    }
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
