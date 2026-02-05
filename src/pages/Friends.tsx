 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useAuth } from '@/contexts/AuthContext';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
 import { ArrowLeft, Link2, Copy, Share2, RefreshCw, Users, Search, UserPlus, QrCode, Check, Loader2, Clock } from 'lucide-react';
 import { toast } from 'sonner';
 import { haptic } from '@/lib/haptics';
 import { QRCodeModal } from '@/components/QRCodeModal';
 import { useCheckIn } from '@/contexts/CheckInContext';
 
 interface SearchResult {
   id: string;
   display_name: string;
   username: string;
   avatar_url: string | null;
 }
 
 type FriendshipStatus = 'none' | 'pending' | 'accepted';
 
 export default function Friends() {
   const navigate = useNavigate();
   const { user } = useAuth();
   const { openCheckIn } = useCheckIn();
   
   // Invite link state
   const [inviteCode, setInviteCode] = useState<string | null>(null);
   const [usesCount, setUsesCount] = useState(0);
   const [loading, setLoading] = useState(true);
   const [generating, setGenerating] = useState(false);
   
   // Search state
   const [searchQuery, setSearchQuery] = useState('');
   const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
   const [searching, setSearching] = useState(false);
   const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, FriendshipStatus>>({});
   
   // QR modal state
   const [showQRModal, setShowQRModal] = useState(false);
 
   useEffect(() => {
     if (user) {
       fetchOrCreateInviteCode();
     }
   }, [user]);
 
   useEffect(() => {
     const timer = setTimeout(() => {
       if (searchQuery.trim().length >= 2) {
         searchUsers();
       } else {
         setSearchResults([]);
       }
     }, 300);
     return () => clearTimeout(timer);
   }, [searchQuery]);
 
   const fetchOrCreateInviteCode = async () => {
     try {
       const { data: existingCode } = await supabase
         .from('invite_codes')
         .select('code, uses_count')
         .eq('user_id', user?.id)
         .order('created_at', { ascending: false })
         .limit(1)
         .maybeSingle();
 
       if (existingCode) {
         setInviteCode(existingCode.code);
         setUsesCount(existingCode.uses_count ?? 0);
         setLoading(false);
         return;
       }
 
       await generateNewCode();
     } catch (error) {
       console.error('Error fetching invite code:', error);
       setLoading(false);
     }
   };
 
   const generateNewCode = async () => {
     setGenerating(true);
     try {
       const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
       let newCode = '';
       for (let i = 0; i < 8; i++) {
         newCode += chars.charAt(Math.floor(Math.random() * chars.length));
       }
 
       const { data, error } = await supabase
         .from('invite_codes')
         .insert({ user_id: user?.id, code: newCode })
         .select('code, uses_count')
         .single();
 
       if (error) throw error;
 
       setInviteCode(data.code);
       setUsesCount(data.uses_count ?? 0);
       haptic.success();
       toast.success('New invite link generated!');
     } catch (error) {
       toast.error('Failed to generate invite code');
     } finally {
       setGenerating(false);
       setLoading(false);
     }
   };
 
   const getInviteUrl = () => `${window.location.origin}/invite/${inviteCode}`;
 
   const handleCopyLink = async () => {
     try {
       await navigator.clipboard.writeText(getInviteUrl());
       haptic.light();
       toast.success('Link copied to clipboard!');
     } catch (error) {
       toast.error('Failed to copy link');
     }
   };
 
   const handleShare = async () => {
     const shareData = {
       title: 'Join me on Spotted!',
       text: 'Hey! Join me on Spotted to see where friends are going out tonight 🎉',
       url: getInviteUrl(),
     };
 
     if (navigator.share) {
       try {
         await navigator.share(shareData);
         haptic.success();
       } catch (error) {
         // User cancelled share
       }
     } else {
       handleCopyLink();
     }
   };
 
   const searchUsers = async () => {
     setSearching(true);
     try {
       const { data } = await supabase.rpc('get_profiles_safe');
       
       if (data) {
         const filtered = data.filter((profile: any) => 
           profile.id !== user?.id &&
           (profile.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            profile.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
         ).slice(0, 10);
         
         setSearchResults(filtered);
         
         // Fetch friendship statuses for results
         if (filtered.length > 0) {
           await fetchFriendshipStatuses(filtered.map((p: SearchResult) => p.id));
         }
       }
     } catch (error) {
       console.error('Search error:', error);
     } finally {
       setSearching(false);
     }
   };
 
   const fetchFriendshipStatuses = async (userIds: string[]) => {
     if (!user?.id) return;
     
     try {
       const { data } = await supabase
         .from('friendships')
         .select('user_id, friend_id, status')
         .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
 
       const statuses: Record<string, FriendshipStatus> = {};
       
       userIds.forEach(id => {
         const friendship = data?.find(
           f => (f.user_id === user.id && f.friend_id === id) ||
                (f.user_id === id && f.friend_id === user.id)
         );
         
         if (friendship) {
           statuses[id] = friendship.status as FriendshipStatus;
         } else {
           statuses[id] = 'none';
         }
       });
       
       setFriendshipStatuses(statuses);
     } catch (error) {
       console.error('Error fetching friendship statuses:', error);
     }
   };
 
   const sendFriendRequest = async (friendId: string) => {
     try {
       const currentStatus = friendshipStatuses[friendId];
       
       if (currentStatus === 'accepted') {
         toast.info('Already friends!');
         return;
       }
       
       if (currentStatus === 'pending') {
         toast.info('Request already pending');
         return;
       }
 
       const { error } = await supabase
         .from('friendships')
         .insert({ user_id: user?.id, friend_id: friendId, status: 'pending' });
 
       if (error) throw error;
 
       setFriendshipStatuses(prev => ({ ...prev, [friendId]: 'pending' }));
       haptic.success();
       toast.success('Friend request sent!');
     } catch (error) {
       toast.error('Failed to send request');
     }
   };
 
   const getButtonState = (userId: string) => {
     const status = friendshipStatuses[userId];
     
     if (status === 'accepted') {
       return { label: 'Friends', icon: Check, disabled: true, variant: 'outline' as const };
     }
     if (status === 'pending') {
       return { label: 'Pending', icon: Clock, disabled: true, variant: 'outline' as const };
     }
     return { label: 'Add', icon: UserPlus, disabled: false, variant: 'default' as const };
   };
 
   return (
     <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
       {/* Header */}
       <header className="sticky top-0 z-50 bg-[#2d1b4e]/80 backdrop-blur-lg border-b border-white/10 px-4 py-3">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
             <button
               onClick={() => navigate(-1)}
               className="p-2 -ml-2 text-white/80 hover:text-white"
             >
               <ArrowLeft className="h-5 w-5" />
             </button>
             <h1 className="text-lg font-semibold text-white">Find Friends</h1>
           </div>
           <Button
             onClick={openCheckIn}
             size="sm"
             className="bg-[#a855f7] hover:bg-[#a855f7]/90 text-white"
           >
             Check In
           </Button>
         </div>
       </header>
 
       <div className="p-4 space-y-4">
         {/* Share Your Link Section */}
         <div className="bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4 space-y-4">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-full bg-[#a855f7] flex items-center justify-center">
               <Link2 className="h-6 w-6 text-white" />
             </div>
             <div>
               <h3 className="font-semibold text-white">Share Your Link</h3>
               <p className="text-white/60 text-sm">Invite friends to join Spotted</p>
             </div>
           </div>
 
           {loading ? (
             <div className="h-12 bg-[#1a0f2e] rounded-xl animate-pulse" />
           ) : (
             <>
               <div className="flex items-center gap-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl p-3">
                 <span className="text-white/80 text-sm truncate flex-1 font-mono">
                   {getInviteUrl()}
                 </span>
                 <Button
                   onClick={handleCopyLink}
                   variant="ghost"
                   size="icon"
                   className="text-[#a855f7] hover:bg-[#a855f7]/20 shrink-0"
                 >
                   <Copy className="h-4 w-4" />
                 </Button>
               </div>
 
               <div className="flex gap-2">
                 <Button
                   onClick={handleShare}
                   className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.4)] text-white"
                 >
                   <Share2 className="h-4 w-4 mr-2" />
                   Share Link
                 </Button>
                 <Button
                   onClick={generateNewCode}
                   variant="outline"
                   className="border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20"
                   disabled={generating}
                 >
                   <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                 </Button>
               </div>
 
               {usesCount > 0 && (
                 <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
                   <Users className="h-4 w-4" />
                   <span>{usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link</span>
                 </div>
               )}
             </>
           )}
         </div>
 
         {/* Find on Spotted Section */}
         <div className="bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4 space-y-4">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-full bg-[#a855f7]/30 flex items-center justify-center">
               <Search className="h-6 w-6 text-[#a855f7]" />
             </div>
             <div>
               <h3 className="font-semibold text-white">Find on Spotted</h3>
               <p className="text-white/60 text-sm">Search by username</p>
             </div>
           </div>
 
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
             <Input
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               placeholder="Search by username..."
               className="pl-10 bg-[#1a0f2e] border-[#a855f7]/40 text-white placeholder:text-white/40"
             />
           </div>
 
           {searching && (
             <div className="flex justify-center py-2">
               <Loader2 className="h-5 w-5 text-[#a855f7] animate-spin" />
             </div>
           )}
 
           {searchResults.length > 0 && (
             <div className="space-y-2">
               {searchResults.map((result) => {
                 const buttonState = getButtonState(result.id);
                 const ButtonIcon = buttonState.icon;
                 
                 return (
                   <div
                     key={result.id}
                     className="flex items-center gap-3 p-3 bg-[#1a0f2e] rounded-xl"
                   >
                     <Avatar className="h-10 w-10 border border-[#a855f7]/40">
                       <AvatarImage src={result.avatar_url || undefined} />
                       <AvatarFallback className="bg-[#2d1b4e] text-white">
                         {result.display_name?.[0] || 'U'}
                       </AvatarFallback>
                     </Avatar>
                     <div className="flex-1 min-w-0">
                       <p className="font-medium text-white truncate">{result.display_name}</p>
                       <p className="text-white/60 text-sm truncate">@{result.username}</p>
                     </div>
                     <Button
                       onClick={() => sendFriendRequest(result.id)}
                       size="sm"
                       disabled={buttonState.disabled}
                       variant={buttonState.variant}
                       className={buttonState.disabled 
                         ? "border-[#a855f7]/40 text-white/60"
                         : "bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
                       }
                     >
                       <ButtonIcon className="h-4 w-4 mr-1" />
                       {buttonState.label}
                     </Button>
                   </div>
                 );
               })}
             </div>
           )}
 
           {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
             <p className="text-white/50 text-sm text-center py-2">
               No users found. Invite them with your link!
             </p>
           )}
         </div>
 
         {/* Show My QR Code Button */}
         <button
           onClick={() => setShowQRModal(true)}
           className="w-full bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4 flex items-center gap-3 hover:bg-[#a855f7]/10 transition-colors"
         >
           <div className="w-12 h-12 rounded-full bg-[#a855f7]/30 flex items-center justify-center">
             <QrCode className="h-6 w-6 text-[#a855f7]" />
           </div>
           <div className="text-left">
             <h3 className="font-semibold text-white">Show My QR Code</h3>
             <p className="text-white/60 text-sm">For adding friends in person</p>
           </div>
         </button>
       </div>
 
       {/* QR Code Modal */}
       <QRCodeModal
         open={showQRModal}
         onOpenChange={setShowQRModal}
         inviteUrl={getInviteUrl()}
       />
     </div>
   );
 }