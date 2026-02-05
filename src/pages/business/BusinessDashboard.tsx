 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { BusinessLayout } from '@/components/business/BusinessLayout';
 import { VenueSelector } from '@/components/business/VenueSelector';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Megaphone, MessageSquare, TrendingUp, TrendingDown, Clock, Users } from 'lucide-react';
 
 interface Analytics {
   today: number;
   week: number;
   month: number;
   peakHour: number | null;
   weekChange: number;
 }
 
 export default function BusinessDashboard() {
   const navigate = useNavigate();
   const { user } = useAuth();
   const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
   const [analytics, setAnalytics] = useState<Analytics | null>(null);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     async function fetchAnalytics() {
       if (!selectedVenueId) {
         setLoading(false);
         return;
       }
 
       setLoading(true);
       try {
         // Get today's date at midnight
         const today = new Date();
         today.setHours(0, 0, 0, 0);
 
         // Last 7 days
         const weekAgo = new Date(today);
         weekAgo.setDate(weekAgo.getDate() - 7);
 
         // Last 30 days
         const monthAgo = new Date(today);
         monthAgo.setDate(monthAgo.getDate() - 30);
 
         // Previous week (for comparison)
         const twoWeeksAgo = new Date(today);
         twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
 
         // Fetch all check-ins for the venue in the last 30 days
         const { data: checkins, error } = await supabase
           .from('checkins')
           .select('created_at')
           .eq('venue_id', selectedVenueId)
           .gte('created_at', monthAgo.toISOString());
 
         if (error) throw error;
 
         const allCheckins = checkins || [];
 
         // Calculate counts
         const todayCount = allCheckins.filter(c => 
           new Date(c.created_at!) >= today
         ).length;
 
         const weekCount = allCheckins.filter(c => 
           new Date(c.created_at!) >= weekAgo
         ).length;
 
         const monthCount = allCheckins.length;
 
         // Previous week count for comparison
         const prevWeekCount = allCheckins.filter(c => {
           const date = new Date(c.created_at!);
           return date >= twoWeeksAgo && date < weekAgo;
         }).length;
 
         // Week over week change
         const weekChange = prevWeekCount > 0 
           ? Math.round(((weekCount - prevWeekCount) / prevWeekCount) * 100)
           : weekCount > 0 ? 100 : 0;
 
         // Peak hour calculation (from last 7 days)
         const hourCounts: { [hour: number]: number } = {};
         allCheckins
           .filter(c => new Date(c.created_at!) >= weekAgo)
           .forEach(c => {
             const hour = new Date(c.created_at!).getHours();
             hourCounts[hour] = (hourCounts[hour] || 0) + 1;
           });
 
         let peakHour: number | null = null;
         let maxCount = 0;
         Object.entries(hourCounts).forEach(([hour, count]) => {
           if (count > maxCount) {
             maxCount = count;
             peakHour = parseInt(hour);
           }
         });
 
         setAnalytics({
           today: todayCount,
           week: weekCount,
           month: monthCount,
           peakHour,
           weekChange,
         });
       } catch (err) {
         console.error('Error fetching analytics:', err);
       } finally {
         setLoading(false);
       }
     }
 
     fetchAnalytics();
   }, [selectedVenueId]);
 
   const formatHour = (hour: number) => {
     const ampm = hour >= 12 ? 'PM' : 'AM';
     const h = hour % 12 || 12;
     const nextH = (hour + 1) % 12 || 12;
     const nextAmpm = (hour + 1) >= 12 ? 'PM' : 'AM';
     return `${h}${ampm} - ${nextH}${nextAmpm}`;
   };
 
   return (
     <BusinessLayout title="Dashboard" showBack={false}>
       {/* Venue Selector */}
       <div className="mb-6">
         <VenueSelector
           selectedVenueId={selectedVenueId}
           onVenueChange={setSelectedVenueId}
         />
       </div>
 
       {selectedVenueId ? (
         <div className="space-y-4">
           {/* Analytics Cards */}
           <Card className="bg-white/5 border-white/10">
             <CardHeader className="pb-2">
               <CardTitle className="text-white text-lg flex items-center gap-2">
                 <Users className="h-5 w-5 text-primary" />
                 Check-ins
               </CardTitle>
             </CardHeader>
             <CardContent>
               {loading ? (
                 <div className="grid grid-cols-3 gap-3">
                   {[...Array(3)].map((_, i) => (
                     <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
                   ))}
                 </div>
               ) : (
                 <div className="grid grid-cols-3 gap-3">
                   <div className="bg-white/5 rounded-lg p-3 text-center">
                     <div className="text-2xl font-bold text-white">
                       {analytics?.today ?? 0}
                     </div>
                     <div className="text-white/50 text-xs">Today</div>
                   </div>
                   <div className="bg-white/5 rounded-lg p-3 text-center">
                     <div className="text-2xl font-bold text-white">
                       {analytics?.week ?? 0}
                     </div>
                     <div className="text-white/50 text-xs">7 Days</div>
                   </div>
                   <div className="bg-white/5 rounded-lg p-3 text-center">
                     <div className="text-2xl font-bold text-white">
                       {analytics?.month ?? 0}
                     </div>
                     <div className="text-white/50 text-xs">30 Days</div>
                   </div>
                 </div>
               )}
             </CardContent>
           </Card>
 
           {/* Insights */}
           <div className="grid grid-cols-2 gap-3">
             {/* Peak Hour */}
             <Card className="bg-white/5 border-white/10">
               <CardContent className="p-4">
                 <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                   <Clock className="h-4 w-4" />
                   Peak Hour
                 </div>
                 <div className="text-white font-semibold">
                   {loading ? (
                     <div className="h-5 w-20 bg-white/10 rounded animate-pulse" />
                   ) : analytics?.peakHour !== null ? (
                     formatHour(analytics.peakHour)
                   ) : (
                     'No data'
                   )}
                 </div>
               </CardContent>
             </Card>
 
             {/* Week Change */}
             <Card className="bg-white/5 border-white/10">
               <CardContent className="p-4">
                 <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                   {analytics && analytics.weekChange >= 0 ? (
                     <TrendingUp className="h-4 w-4 text-green-400" />
                   ) : (
                     <TrendingDown className="h-4 w-4 text-red-400" />
                   )}
                   vs Last Week
                 </div>
                 <div className={`font-semibold ${
                   analytics && analytics.weekChange >= 0 ? 'text-green-400' : 'text-red-400'
                 }`}>
                   {loading ? (
                     <div className="h-5 w-16 bg-white/10 rounded animate-pulse" />
                   ) : (
                     `${analytics?.weekChange >= 0 ? '+' : ''}${analytics?.weekChange ?? 0}%`
                   )}
                 </div>
               </CardContent>
             </Card>
           </div>
 
           {/* Quick Actions */}
           <Card className="bg-white/5 border-white/10">
             <CardHeader className="pb-2">
               <CardTitle className="text-white text-sm">Quick Actions</CardTitle>
             </CardHeader>
             <CardContent className="grid grid-cols-2 gap-3">
               <Button
                 onClick={() => navigate('/business/promote')}
                 variant="outline"
                 className="h-auto py-4 flex-col gap-2 border-white/20 text-white hover:bg-white/10"
               >
                 <Megaphone className="h-5 w-5 text-primary" />
                 <span className="text-xs">Promote Venue</span>
               </Button>
               <Button
                 onClick={() => navigate('/business/yap')}
                 variant="outline"
                 className="h-auto py-4 flex-col gap-2 border-white/20 text-white hover:bg-white/10"
               >
                 <MessageSquare className="h-5 w-5 text-primary" />
                 <span className="text-xs">Post to Yap</span>
               </Button>
             </CardContent>
           </Card>
         </div>
       ) : (
         <Card className="bg-white/5 border-white/10">
           <CardContent className="py-12 text-center">
             <p className="text-white/60">
               No venues found. Your claim may still be pending review.
             </p>
             <Button
               onClick={() => navigate('/business/auth')}
               className="mt-4 bg-primary hover:bg-primary/80"
             >
               Claim a Venue
             </Button>
           </CardContent>
         </Card>
       )}
     </BusinessLayout>
   );
 }