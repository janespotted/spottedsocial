 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent } from '@/components/ui/card';
 import { Building2, BarChart3, Megaphone, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
 import { SpottedLogo } from '@/components/SpottedLogo';
 
 export default function BusinessLanding() {
   const navigate = useNavigate();
   const { user, loading: authLoading } = useAuth();
   const [checkingOwnership, setCheckingOwnership] = useState(false);
 
   useEffect(() => {
     async function checkIfVenueOwner() {
       if (!user) return;
 
       setCheckingOwnership(true);
       try {
         const { data } = await supabase
           .rpc('is_any_venue_owner', { check_user_id: user.id });
 
         if (data) {
           navigate('/business/dashboard', { replace: true });
         }
       } catch (err) {
         console.error('Error checking venue ownership:', err);
       } finally {
         setCheckingOwnership(false);
       }
     }
 
     if (!authLoading && user) {
       checkIfVenueOwner();
     }
   }, [user, authLoading, navigate]);
 
   const features = [
     {
       icon: BarChart3,
       title: 'Real-time Analytics',
       description: 'See who\'s checking in, when, and how often',
     },
     {
       icon: Megaphone,
       title: 'Promote Your Venue',
       description: 'Boost visibility on the leaderboard and map',
     },
     {
       icon: MessageSquare,
       title: 'Engage Customers',
       description: 'Post announcements to your venue\'s Yap board',
     },
   ];
 
   if (authLoading || checkingOwnership) {
     return (
       <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] flex items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
       <div className="max-w-[430px] mx-auto px-4 py-8">
         {/* Header */}
         <div className="text-center mb-8">
           <div className="flex justify-center mb-4">
             <SpottedLogo className="h-16 w-16" />
           </div>
           <h1 className="text-2xl font-bold text-white mb-2">
             Spotted for Business
           </h1>
           <p className="text-white/60">
             Manage your venue, engage customers, grow your business
           </p>
         </div>
 
         {/* Features */}
         <div className="space-y-4 mb-8">
           {features.map((feature, index) => (
             <Card key={index} className="bg-white/5 border-white/10">
               <CardContent className="flex items-center gap-4 p-4">
                 <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                   <feature.icon className="h-6 w-6 text-primary" />
                 </div>
                 <div>
                   <h3 className="text-white font-semibold">{feature.title}</h3>
                   <p className="text-white/60 text-sm">{feature.description}</p>
                 </div>
               </CardContent>
             </Card>
           ))}
         </div>
 
         {/* CTA */}
         <div className="space-y-3">
           <Button
             onClick={() => navigate('/business/auth')}
             className="w-full bg-primary hover:bg-primary/80 h-12 text-base"
           >
             <Building2 className="h-5 w-5 mr-2" />
             Claim Your Venue
             <ArrowRight className="h-5 w-5 ml-2" />
           </Button>
 
           {!user && (
             <p className="text-center text-white/50 text-sm">
               Already have an account?{' '}
               <button
                 onClick={() => navigate('/auth')}
                 className="text-primary hover:underline"
               >
                 Sign in
               </button>
             </p>
           )}
 
           <button
             onClick={() => navigate('/')}
             className="w-full text-center text-white/50 text-sm hover:text-white/70"
           >
             ← Back to Spotted
           </button>
         </div>
       </div>
     </div>
   );
 }