 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useAuth } from '@/contexts/AuthContext';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Link2, Copy, Share2, RefreshCw, Users, Search, UserPlus, QrCode, Check, Loader2, Clock, ChevronRight, Sparkles } from 'lucide-react';
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
  
  // Friend count state
  const [friendCount, setFriendCount] = useState(0);
  
  // Copy animation state
  const [justCopied, setJustCopied] = useState(false);
 
   useEffect(() => {
     if (user) {
       fetchOrCreateInviteCode();
      fetchFriendCount();
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
  
  const fetchFriendCount = async () => {
    if (!user?.id) return;
    try {
      const { count } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
      setFriendCount(count || 0);
    } catch (error) {
      console.error('Error fetching friend count:', error);
    }
  };
 
   const getInviteUrl = () => `${window.location.origin}/invite/${inviteCode}`;
 
   const handleCopyLink = async () => {
     try {
       await navigator.clipboard.writeText(getInviteUrl());
       haptic.light();
      setJustCopied(true);
       toast.success('Link copied to clipboard!');
      setTimeout(() => setJustCopied(false), 2000);
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
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
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
 
      <div className="p-4 space-y-5">
        {/* Hero Section */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-2 bg-[#a855f7]/20 border border-[#a855f7]/30 rounded-full px-4 py-2 mb-3">
            <Sparkles className="h-4 w-4 text-[#a855f7]" />
            <span className="text-white/90 text-sm font-medium">Grow Your Squad</span>
          </div>
          <p className="text-white/60 text-sm">
            {friendCount > 0 
              ? `You have ${friendCount} friend${friendCount !== 1 ? 's' : ''} on Spotted`
              : "Invite friends to see where they're going tonight"}
          </p>
        </div>

        {/* Share Your Link Section */}
        <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 space-y-5 shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:shadow-[0_0_40px_rgba(168,85,247,0.25)] transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center">
              <Link2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">Share Your Link</h3>
              <p className="text-white/50 text-sm">Invite friends to join Spotted</p>
             </div>
           </div>
 
           {loading ? (
            <div className="h-24 bg-[#0a0118]/50 rounded-2xl animate-pulse" />
           ) : (
             <>
              {/* Invite Code Display */}
              <div className="bg-[#0a0118]/50 border border-[#a855f7]/20 rounded-2xl p-4">
                <div className="text-center mb-3">
                  <span className="text-white/40 text-xs uppercase tracking-widest">
                    Your invite code
                  </span>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <div className="text-2xl font-bold text-white tracking-[0.2em]">
                      {inviteCode}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="p-2 rounded-xl bg-[#a855f7]/20 hover:bg-[#a855f7]/30 transition-colors"
                    >
                      {justCopied ? (
                        <Check className="h-5 w-5 text-green-400" />
                      ) : (
                        <Copy className="h-5 w-5 text-[#a855f7]" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                 <Button
                   onClick={handleShare}
                  className="flex-1 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] shadow-[0_0_25px_rgba(168,85,247,0.5)] text-white font-semibold py-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                 >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Share Invite
                 </Button>
                 <Button
                   onClick={generateNewCode}
                   variant="outline"
                  className="border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20 py-6 px-4 rounded-2xl"
                   disabled={generating}
                 >
                   <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                 </Button>
               </div>
 
               {usesCount > 0 && (
                <div className="flex items-center justify-center gap-2 text-[#a855f7] text-sm bg-[#a855f7]/10 rounded-xl py-2">
                  <Users className="h-4 w-4" />
                   <span>{usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link</span>
                 </div>
               )}
             </>
           )}
         </div>
 
         {/* Find on Spotted Section */}
        <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 space-y-4 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center">
              <Search className="h-7 w-7 text-white" />
             </div>
             <div>
              <h3 className="font-semibold text-white text-lg">Find on Spotted</h3>
              <p className="text-white/50 text-sm">Search by username or name</p>
             </div>
           </div>
 
           <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
             <Input
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search username or name..."
              className="pl-11 py-6 bg-[#0a0118]/50 border-[#a855f7]/20 rounded-2xl text-white placeholder:text-white/40 focus:border-[#a855f7]/50"
             />
           </div>
 
           {searching && (
            <div className="flex justify-center py-4">
               <Loader2 className="h-5 w-5 text-[#a855f7] animate-spin" />
             </div>
           )}
 
           {searchResults.length > 0 && (
            <div className="space-y-3">
               {searchResults.map((result) => {
                 const buttonState = getButtonState(result.id);
                 const ButtonIcon = buttonState.icon;
                 
                 return (
                   <div
                     key={result.id}
                    className="flex items-center gap-3 p-3 bg-[#0a0118]/50 rounded-2xl border border-[#a855f7]/10"
                   >
                    <Avatar className="h-11 w-11 border-2 border-[#a855f7]/40">
                       <AvatarImage src={result.avatar_url || undefined} />
                       <AvatarFallback className="bg-[#2d1b4e] text-white">
                         {result.display_name?.[0] || 'U'}
                       </AvatarFallback>
                     </Avatar>
                     <div className="flex-1 min-w-0">
                       <p className="font-medium text-white truncate">{result.display_name}</p>
                      <p className="text-white/50 text-sm truncate">@{result.username}</p>
                     </div>
                     <Button
                       onClick={() => sendFriendRequest(result.id)}
                       size="sm"
                       disabled={buttonState.disabled}
                       variant={buttonState.variant}
                       className={buttonState.disabled 
                        ? "border-[#a855f7]/40 text-white/60 rounded-xl"
                        : "bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] text-white rounded-xl"
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
            <p className="text-white/50 text-sm text-center py-4">
               No users found. Invite them with your link!
             </p>
           )}
         </div>
 
         {/* Show My QR Code Button */}
         <button
           onClick={() => setShowQRModal(true)}
          className="w-full bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 flex items-center gap-4 hover:bg-[#a855f7]/10 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] transition-all duration-300 shadow-[0_0_30px_rgba(168,85,247,0.15)]"
         >
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center">
            <QrCode className="h-7 w-7 text-white" />
           </div>
          <div className="text-left flex-1">
            <h3 className="font-semibold text-white text-lg">Show My QR Code</h3>
            <p className="text-white/50 text-sm">For adding friends in person</p>
           </div>
          <ChevronRight className="h-5 w-5 text-white/40" />
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