 import { useState, useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { toast } from 'sonner';
 import { Building2, CheckCircle, XCircle, Clock, Mail, Phone, Loader2 } from 'lucide-react';
 
 interface ClaimRequest {
   id: string;
   user_id: string;
   venue_id: string | null;
   venue_name: string | null;
   business_email: string;
   business_phone: string | null;
   verification_notes: string | null;
   status: string;
   created_at: string;
   venue?: {
     id: string;
     name: string;
     neighborhood: string;
   } | null;
 }
 
 export function ClaimRequestsPanel() {
   const { user } = useAuth();
   const [claims, setClaims] = useState<ClaimRequest[]>([]);
   const [loading, setLoading] = useState(true);
   const [processingId, setProcessingId] = useState<string | null>(null);
 
   const fetchClaims = async () => {
     setLoading(true);
     try {
       const { data, error } = await supabase
         .from('venue_claim_requests')
         .select(`
           *,
           venue:venues (
             id,
             name,
             neighborhood
           )
         `)
         .order('created_at', { ascending: false });
 
       if (error) throw error;
       setClaims(data || []);
     } catch (err) {
       console.error('Error fetching claims:', err);
       toast.error('Failed to load claim requests');
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchClaims();
   }, []);
 
   const handleApprove = async (claim: ClaimRequest) => {
     if (!user || !claim.venue_id) return;
 
     setProcessingId(claim.id);
     try {
       // Create venue_owners record
       const { error: ownerError } = await supabase
         .from('venue_owners')
         .insert({
           user_id: claim.user_id,
           venue_id: claim.venue_id,
           role: 'owner',
         });
 
       if (ownerError) throw ownerError;
 
       // Update claim status
       const { error: claimError } = await supabase
         .from('venue_claim_requests')
         .update({
           status: 'approved',
           reviewed_by: user.id,
           reviewed_at: new Date().toISOString(),
         })
         .eq('id', claim.id);
 
       if (claimError) throw claimError;
 
       toast.success(`Approved claim for ${claim.venue?.name || claim.venue_name}`);
       fetchClaims();
     } catch (err: any) {
       console.error('Error approving claim:', err);
       if (err.code === '23505') {
         toast.error('User already owns this venue');
       } else {
         toast.error('Failed to approve claim');
       }
     } finally {
       setProcessingId(null);
     }
   };
 
   const handleReject = async (claim: ClaimRequest) => {
     if (!user) return;
 
     setProcessingId(claim.id);
     try {
       const { error } = await supabase
         .from('venue_claim_requests')
         .update({
           status: 'rejected',
           reviewed_by: user.id,
           reviewed_at: new Date().toISOString(),
         })
         .eq('id', claim.id);
 
       if (error) throw error;
 
       toast.success(`Rejected claim for ${claim.venue?.name || claim.venue_name}`);
       fetchClaims();
     } catch (err) {
       console.error('Error rejecting claim:', err);
       toast.error('Failed to reject claim');
     } finally {
       setProcessingId(null);
     }
   };
 
   const pendingClaims = claims.filter(c => c.status === 'pending');
   const processedClaims = claims.filter(c => c.status !== 'pending');
 
   const formatDate = (dateStr: string) => {
     return new Date(dateStr).toLocaleDateString('en-US', {
       month: 'short',
       day: 'numeric',
       hour: '2-digit',
       minute: '2-digit',
     });
   };
 
   return (
     <div className="space-y-4">
       {/* Pending Claims */}
       <Card className="bg-white/5 border-white/10">
         <CardHeader className="pb-3">
           <CardTitle className="text-white text-sm flex items-center gap-2">
             <Clock className="h-4 w-4 text-yellow-400" />
             Pending Claims ({pendingClaims.length})
           </CardTitle>
         </CardHeader>
         <CardContent>
           {loading ? (
             <div className="text-white/50 text-sm">Loading...</div>
           ) : pendingClaims.length === 0 ? (
             <div className="text-white/50 text-sm">No pending claims</div>
           ) : (
             <div className="space-y-3">
               {pendingClaims.map((claim) => (
                 <div
                   key={claim.id}
                   className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3"
                 >
                   {/* Venue Info */}
                   <div className="flex items-start justify-between">
                     <div className="flex items-center gap-2">
                       <Building2 className="h-4 w-4 text-primary" />
                       <div>
                         <div className="text-white font-medium">
                           {claim.venue?.name || claim.venue_name}
                         </div>
                         {claim.venue && (
                           <div className="text-white/50 text-xs">
                             {claim.venue.neighborhood}
                           </div>
                         )}
                       </div>
                     </div>
                     <div className="text-white/40 text-xs">
                       {formatDate(claim.created_at)}
                     </div>
                   </div>
 
                   {/* Contact Info */}
                   <div className="flex flex-wrap gap-3 text-xs">
                     <div className="flex items-center gap-1 text-white/60">
                       <Mail className="h-3 w-3" />
                       {claim.business_email}
                     </div>
                     {claim.business_phone && (
                       <div className="flex items-center gap-1 text-white/60">
                         <Phone className="h-3 w-3" />
                         {claim.business_phone}
                       </div>
                     )}
                   </div>
 
                   {claim.verification_notes && (
                     <div className="text-white/50 text-xs bg-white/5 p-2 rounded">
                       {claim.verification_notes}
                     </div>
                   )}
 
                   {/* Actions */}
                   <div className="flex gap-2">
                     <Button
                       size="sm"
                       onClick={() => handleApprove(claim)}
                       disabled={processingId === claim.id || !claim.venue_id}
                       className="flex-1 bg-green-600 hover:bg-green-700"
                     >
                       {processingId === claim.id ? (
                         <Loader2 className="h-4 w-4 animate-spin" />
                       ) : (
                         <>
                           <CheckCircle className="h-4 w-4 mr-1" />
                           Approve
                         </>
                       )}
                     </Button>
                     <Button
                       size="sm"
                       variant="destructive"
                       onClick={() => handleReject(claim)}
                       disabled={processingId === claim.id}
                       className="flex-1"
                     >
                       {processingId === claim.id ? (
                         <Loader2 className="h-4 w-4 animate-spin" />
                       ) : (
                         <>
                           <XCircle className="h-4 w-4 mr-1" />
                           Reject
                         </>
                       )}
                     </Button>
                   </div>
                 </div>
               ))}
             </div>
           )}
         </CardContent>
       </Card>
 
       {/* Processed Claims */}
       {processedClaims.length > 0 && (
         <Card className="bg-white/5 border-white/10">
           <CardHeader className="pb-3">
             <CardTitle className="text-white text-sm">
               Recent Decisions ({processedClaims.length})
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-2 max-h-[300px] overflow-y-auto">
               {processedClaims.slice(0, 10).map((claim) => (
                 <div
                   key={claim.id}
                   className="flex items-center justify-between p-2 rounded bg-white/5"
                 >
                   <div className="flex items-center gap-2">
                     <Building2 className="h-4 w-4 text-white/40" />
                     <span className="text-white text-sm">
                       {claim.venue?.name || claim.venue_name}
                     </span>
                   </div>
                   <Badge
                     className={
                       claim.status === 'approved'
                         ? 'bg-green-500/20 text-green-400'
                         : 'bg-red-500/20 text-red-400'
                     }
                   >
                     {claim.status}
                   </Badge>
                 </div>
               ))}
             </div>
           </CardContent>
         </Card>
       )}
     </div>
   );
 }