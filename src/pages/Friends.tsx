import { useState, useEffect, useCallback } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useAuth } from '@/contexts/AuthContext';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Copy, Users, Search, UserPlus, QrCode, Check, Loader2, Clock, ChevronRight, MessageCircle, Link2 } from 'lucide-react';
 import { toast } from 'sonner';
 import { haptic } from '@/lib/haptics';
 import { QRCodeModal } from '@/components/QRCodeModal';
 
 interface SearchResult {
   id: string;
   display_name: string;
   username: string;
   avatar_url: string | null;
 }
 
interface SuggestedFriend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  mutual_count: number;
}

 type FriendshipStatus = 'none' | 'pending' | 'accepted';
 
 export default function Friends() {
   const navigate = useNavigate();
   const { user } = useAuth();
   
   // Invite link state
   const [inviteCode, setInviteCode] = useState<string | null>(null);
   const [usesCount, setUsesCount] = useState(0);
   const [loading, setLoading] = useState(true);
   
   // Search state
   const [searchQuery, setSearchQuery] = useState('');
   const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
   const [searching, setSearching] = useState(false);
   const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, FriendshipStatus>>({});
   
   // QR modal state
   const [showQRModal, setShowQRModal] = useState(false);
  
  // Copy animation state
  const [justCopied, setJustCopied] = useState(false);
  
  // People you may know state
  const [suggestedFriends, setSuggestedFriends] = useState<SuggestedFriend[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
 
   useEffect(() => {
     if (user) {
       fetchOrCreateInviteCode();
      fetchSuggestedFriends();
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
 
      // Generate new code
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

      if (!error && data) {
        setInviteCode(data.code);
        setUsesCount(data.uses_count ?? 0);
      }
      setLoading(false);
     } catch (error) {
       console.error('Error fetching invite code:', error);
       setLoading(false);
     }
   };
 
  const fetchSuggestedFriends = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSuggestions(true);
    
     try {
      // 1. Get current user's friend IDs
      const { data: myFriendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
      
      const myFriendIds = new Set<string>();
      myFriendships?.forEach(f => {
        myFriendIds.add(f.user_id === user.id ? f.friend_id : f.user_id);
      });
      
      // 2. Get friends of those friends
      if (myFriendIds.size === 0) {
        setSuggestedFriends([]);
        setLoadingSuggestions(false);
        return;
       }
      
      const friendIdArray = [...myFriendIds];
      const { data: friendsOfFriends } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(friendIdArray.map(id => `user_id.eq.${id},friend_id.eq.${id}`).join(','));
      
      // 3. Count mutual connections and filter out self/existing friends
      const mutualCounts: Record<string, number> = {};
      friendsOfFriends?.forEach(f => {
        const otherId = myFriendIds.has(f.user_id) ? f.friend_id : f.user_id;
        if (otherId !== user.id && !myFriendIds.has(otherId)) {
          mutualCounts[otherId] = (mutualCounts[otherId] || 0) + 1;
        }
      });
      
      // 4. Get profiles for top suggestions (sorted by mutual count)
      const topSuggestionIds = Object.entries(mutualCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id);
      
      if (topSuggestionIds.length === 0) {
        setSuggestedFriends([]);
        setLoadingSuggestions(false);
        return;
      }
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', topSuggestionIds);
      
      const suggestions = profiles?.map(p => ({
        ...p,
        mutual_count: mutualCounts[p.id] || 0
      })).sort((a, b) => b.mutual_count - a.mutual_count) || [];
      
      setSuggestedFriends(suggestions);
     } catch (error) {
      console.error('Error fetching suggestions:', error);
     } finally {
      setLoadingSuggestions(false);
    }
  }, [user?.id]);
 
   const getInviteUrl = () => `${window.location.origin}/invite/${inviteCode}`;
 
  const handleTextFriend = () => {
    const message = encodeURIComponent(
      `Hey! Join me on Spotted to see where friends are going out tonight 🎉 ${getInviteUrl()}`
    );
    haptic.light();
    window.location.href = `sms:?&body=${message}`;
  };

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
         </div>
       </header>
 
      <div className="p-4 space-y-5">
          {/* Invite Friends Section */}
          <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center">
                <Link2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-lg">Invite Friends</h3>
                <p className="text-white/50 text-sm">Share your link to grow your squad</p>
              </div>
            </div>
 
            {loading ? (
              <div className="h-24 bg-[#0a0118]/50 rounded-2xl animate-pulse" />
            ) : (
              <div className="space-y-3">
                 <Button
                    onClick={handleTextFriend}
                    className="w-full bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#9333ea] hover:to-[#6b21a8] text-white font-semibold py-6 rounded-2xl"
                 >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Text a Friend
                 </Button>
                 <Button
                    onClick={handleCopyLink}
                    variant="outline"
                    className="w-full border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20 py-6 rounded-2xl"
                 >
                    {justCopied ? (
                      <Check className="h-5 w-5 mr-2 text-green-400" />
                    ) : (
                      <Copy className="h-5 w-5 mr-2" />
                    )}
                    {justCopied ? 'Copied!' : 'Copy Invite Link'}
                 </Button>

                {usesCount > 0 && (
                  <div className="flex items-center justify-center gap-2 text-[#a855f7] text-sm pt-2">
                  <Users className="h-4 w-4" />
                    <span>{usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* People You May Know Section */}
          {(loadingSuggestions || suggestedFriends.length > 0) && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white text-lg px-1">People You May Know</h3>
              
              {loadingSuggestions ? (
                <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5">
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 text-[#a855f7] animate-spin" />
                  </div>
                </div>
              ) : (
                <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl overflow-hidden">
                  {suggestedFriends.map((friend, index) => {
                    const buttonState = getButtonState(friend.id);
                    const ButtonIcon = buttonState.icon;
                    
                    return (
                      <div
                        key={friend.id}
                        className={`flex items-center gap-3 p-4 ${
                          index !== suggestedFriends.length - 1 ? 'border-b border-white/10' : ''
                        }`}
                      >
                        <Avatar className="h-12 w-12 border-2 border-[#a855f7]/40">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#2d1b4e] text-white">
                            {friend.display_name?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">{friend.display_name}</p>
                          <p className="text-white/50 text-sm flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {friend.mutual_count} mutual friend{friend.mutual_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <Button
                          onClick={() => sendFriendRequest(friend.id)}
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
            </div>
          )}
 
         {/* Find on Spotted Section */}
          <div className="bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username..."
                className="pl-11 py-5 bg-[#0a0118]/50 border-[#a855f7]/20 rounded-2xl text-white placeholder:text-white/40 focus:border-[#a855f7]/50"
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
            className="w-full bg-[#1a0f2e]/80 backdrop-blur-xl border border-[#a855f7]/30 rounded-3xl p-5 flex items-center gap-4 hover:bg-[#a855f7]/10 transition-all duration-300"
         >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center">
              <QrCode className="h-6 w-6 text-white" />
            </div>
            <div className="text-left flex-1">
              <h3 className="font-semibold text-white">Show My QR Code</h3>
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