 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { toast } from 'sonner';
 import { ArrowLeft, Loader2, Building2, Clock } from 'lucide-react';
 import { ClaimVenueForm } from '@/components/business/ClaimVenueForm';
 import spottedLogo from '@/assets/spotted-s-logo.png';
 
 interface PendingClaim {
   id: string;
   venue_name: string;
   status: string;
   created_at: string;
 }
 
 export default function BusinessAuth() {
   const navigate = useNavigate();
   const { user, loading: authLoading } = useAuth();
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
   const [isSignUp, setIsSignUp] = useState(false);
   const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([]);
   const [checkingClaims, setCheckingClaims] = useState(false);
 
   // Check for existing pending claims when user is logged in
   useEffect(() => {
     async function fetchPendingClaims() {
       if (!user) return;
 
       setCheckingClaims(true);
       try {
         // First check if already a venue owner
         const { data: isOwner } = await supabase
           .rpc('is_any_venue_owner', { check_user_id: user.id });
 
         if (isOwner) {
           navigate('/business/dashboard', { replace: true });
           return;
         }
 
         // Check for pending claims
         const { data, error } = await supabase
           .from('venue_claim_requests')
           .select('id, venue_name, status, created_at')
           .eq('user_id', user.id)
           .eq('status', 'pending');
 
         if (error) throw error;
         setPendingClaims(data || []);
       } catch (err) {
         console.error('Error fetching claims:', err);
       } finally {
         setCheckingClaims(false);
       }
     }
 
     if (!authLoading) {
       fetchPendingClaims();
     }
   }, [user, authLoading, navigate]);
 
   const handleAuth = async (e: React.FormEvent) => {
     e.preventDefault();
     setLoading(true);
 
     try {
       if (isSignUp) {
         const { error } = await supabase.auth.signUp({
           email,
           password,
         });
         if (error) throw error;
         toast.success('Check your email to confirm your account');
       } else {
         const { error } = await supabase.auth.signInWithPassword({
           email,
           password,
         });
         if (error) throw error;
       }
     } catch (err: any) {
       toast.error(err.message || 'Authentication failed');
     } finally {
       setLoading(false);
     }
   };
 
   if (authLoading || checkingClaims) {
     return (
       <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] flex items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
       <div className="max-w-[430px] mx-auto px-4 py-6">
         {/* Header */}
         <div className="flex items-center gap-3 mb-6">
           <Button
             variant="ghost"
             size="icon"
             onClick={() => navigate('/business')}
             className="text-white hover:bg-white/10"
           >
             <ArrowLeft className="h-5 w-5" />
           </Button>
           <div className="flex items-center gap-2">
             <img src={spottedLogo} alt="Spotted" className="h-8 w-8" />
             <h1 className="text-xl font-semibold text-white">
               {user ? 'Claim Your Venue' : 'Business Sign In'}
             </h1>
           </div>
         </div>
 
         {user ? (
           /* Logged In - Show Claim Form or Pending Claims */
           <div className="space-y-6">
             {pendingClaims.length > 0 && (
               <Card className="bg-yellow-500/10 border-yellow-500/30">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-yellow-400 text-sm flex items-center gap-2">
                     <Clock className="h-4 w-4" />
                     Pending Claims
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-2">
                   {pendingClaims.map((claim) => (
                     <div
                       key={claim.id}
                       className="flex items-center justify-between p-2 rounded bg-white/5"
                     >
                       <span className="text-white text-sm">{claim.venue_name}</span>
                       <span className="text-yellow-400 text-xs">Under review</span>
                     </div>
                   ))}
                   <p className="text-white/50 text-xs mt-2">
                     We'll notify you once your claim is reviewed (usually within 24-48 hours).
                   </p>
                 </CardContent>
               </Card>
             )}
 
             <ClaimVenueForm />
           </div>
         ) : (
           /* Not Logged In - Show Auth Form */
           <Card className="bg-white/5 border-white/10">
             <CardContent className="pt-6">
               <Tabs defaultValue="signin" onValueChange={(v) => setIsSignUp(v === 'signup')}>
                 <TabsList className="w-full bg-white/5 border border-white/10 mb-4">
                   <TabsTrigger value="signin" className="flex-1 data-[state=active]:bg-primary">
                     Sign In
                   </TabsTrigger>
                   <TabsTrigger value="signup" className="flex-1 data-[state=active]:bg-primary">
                     Sign Up
                   </TabsTrigger>
                 </TabsList>
 
                 <form onSubmit={handleAuth} className="space-y-4">
                   <div>
                     <label className="text-white/60 text-sm mb-1 block">Email</label>
                     <Input
                       type="email"
                       value={email}
                       onChange={(e) => setEmail(e.target.value)}
                       placeholder="you@business.com"
                       className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                       required
                     />
                   </div>
 
                   <div>
                     <label className="text-white/60 text-sm mb-1 block">Password</label>
                     <Input
                       type="password"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       placeholder="••••••••"
                       className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                       required
                       minLength={6}
                     />
                   </div>
 
                   <Button
                     type="submit"
                     disabled={loading}
                     className="w-full bg-primary hover:bg-primary/80"
                   >
                     {loading ? (
                       <Loader2 className="h-4 w-4 animate-spin mr-2" />
                     ) : (
                       <Building2 className="h-4 w-4 mr-2" />
                     )}
                     {isSignUp ? 'Create Account' : 'Sign In'}
                   </Button>
                 </form>
               </Tabs>
             </CardContent>
           </Card>
         )}
       </div>
     </div>
   );
 }