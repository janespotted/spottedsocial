 import { useState, useEffect } from 'react';
 import { Navigate } from 'react-router-dom';
 import { useAuth } from '@/contexts/AuthContext';
 import { supabase } from '@/integrations/supabase/client';
 import { Loader2 } from 'lucide-react';
 
 interface BusinessRouteProps {
   children: React.ReactNode;
 }
 
 export function BusinessRoute({ children }: BusinessRouteProps) {
   const { user, loading: authLoading } = useAuth();
   const [isVenueOwner, setIsVenueOwner] = useState<boolean | null>(null);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     async function checkVenueOwnership() {
       if (!user) {
         setIsVenueOwner(false);
         setLoading(false);
         return;
       }
 
       try {
         const { data, error } = await supabase
           .rpc('is_any_venue_owner', { check_user_id: user.id });
         
         if (error) throw error;
         setIsVenueOwner(data ?? false);
       } catch (err) {
         console.error('Error checking venue ownership:', err);
         setIsVenueOwner(false);
       } finally {
         setLoading(false);
       }
     }
 
     if (!authLoading) {
       checkVenueOwnership();
     }
   }, [user, authLoading]);
 
   if (authLoading || loading) {
     return (
       <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] flex items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   if (!user) {
     return <Navigate to="/business" replace />;
   }
 
   if (!isVenueOwner) {
     return <Navigate to="/business" replace />;
   }
 
   return <>{children}</>;
 }