import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { Link2, Copy, Share2, Search, UserPlus, QrCode, Check, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import { QRCodeModal } from '@/components/QRCodeModal';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

interface FindFriendsOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface SearchResult {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

const REQUIRED_FRIENDS = 2;
const REQUIRED_INVITES = 1;

export function FindFriendsOnboarding({ onComplete, onSkip }: FindFriendsOnboardingProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const demoEnabled = useDemoMode();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [showQRModal, setShowQRModal] = useState(false);
  
  // Friend graph tracking
  const [friendsAddedCount, setFriendsAddedCount] = useState(0);
  const [inviteSentCount, setInviteSentCount] = useState(0);
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false);
  const [skipInProgress, setSkipInProgress] = useState(false);

  // Check if requirement is met
  const requirementMet = friendsAddedCount >= REQUIRED_FRIENDS || inviteSentCount >= REQUIRED_INVITES;

  useEffect(() => {
    if (user) {
      fetchOrCreateInviteCode();
      fetchExistingFriendRequests();
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

  const fetchExistingFriendRequests = async () => {
    if (!user?.id) return;
    
    try {
      // Count pending friend requests sent by user
      const { count } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending');
      
      if (count && count > 0) {
        setFriendsAddedCount(count);
      }
    } catch (error) {
      console.error('Error fetching friend requests:', error);
    }
  };

  const fetchOrCreateInviteCode = async () => {
    try {
      const { data: existingCode } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCode) {
        setInviteCode(existingCode.code);
        setLoading(false);
        return;
      }

      // Create new code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let newCode = '';
      for (let i = 0; i < 8; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const { data } = await supabase
        .from('invite_codes')
        .insert({ user_id: user?.id, code: newCode })
        .select('code')
        .single();

      if (data) {
        setInviteCode(data.code);
      }
    } catch (error) {
      console.error('Error with invite code:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInviteUrl = () => `${APP_BASE_URL}/invite/${inviteCode}`;

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(getInviteUrl());
      haptic.light();
      toast.success('Link copied!');
      
      // Track invite action
      setInviteSentCount(prev => prev + 1);
    } catch (error) {
      toast.error('Failed to copy');
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
        
        // Track invite action
        setInviteSentCount(prev => prev + 1);
      } catch (error) {
        // User cancelled - don't count as invite
      }
    } else {
      handleCopyLink();
    }
  };

  const searchUsers = async () => {
    setSearching(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['profiles-safe'],
        queryFn: async () => {
          const { data } = await supabase.rpc('get_profiles_safe');
          return data || [];
        },
        staleTime: 60_000,
      });
      
      if (data) {
        const filtered = data.filter((profile: any) => 
          profile.id !== user?.id &&
          (!demoEnabled ? !profile.is_demo : true) &&
          (profile.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           profile.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
        ).slice(0, 5);
        setSearchResults(filtered);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (friendId: string) => {
    try {
      // Check if already friends or pending
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status')
        .or(`and(user_id.eq.${user?.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user?.id})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') {
          toast.info('Already friends!');
        } else {
          toast.info('Request already pending');
        }
        return;
      }

      const { error } = await supabase
        .from('friendships')
        .insert({ user_id: user?.id, friend_id: friendId, status: 'pending' });

      if (error) throw error;

      setSentRequests(prev => new Set(prev).add(friendId));
      setFriendsAddedCount(prev => prev + 1);
      haptic.success();
      toast.success('Friend request sent!');
    } catch (error) {
      toast.error('Failed to send request');
    }
  };

  const handleContinue = () => {
    if (requirementMet) {
      onComplete();
    }
  };

  const handleSkipAttempt = () => {
    if (requirementMet) {
      // Already met requirement, just continue
      onComplete();
    } else {
      // Show confirmation
      setShowSkipConfirmation(true);
    }
  };

  const handleConfirmSkip = async () => {
    setSkipInProgress(true);
    haptic.light();
    
    // Complete onboarding FIRST, then close dialog
    await onSkip();
    
    setShowSkipConfirmation(false);
    setSkipInProgress(false);
  };

  // Progress indicator text
  const getProgressText = () => {
    if (requirementMet) {
      return "You're all set! 🎉";
    }
    
    const friendsNeeded = Math.max(0, REQUIRED_FRIENDS - friendsAddedCount);
    
    if (friendsAddedCount > 0 && friendsAddedCount < REQUIRED_FRIENDS) {
      return `Add ${friendsNeeded} more friend${friendsNeeded !== 1 ? 's' : ''} or share an invite`;
    }
    
    return `Add ${REQUIRED_FRIENDS} friends or share an invite to continue`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center overflow-y-auto">
      <div className="w-full max-w-[430px] min-h-full flex flex-col p-6">
        {/* Header */}
        <div className="text-center mb-6 pt-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Spotted works best with friends
          </h1>
          <p className="text-white/70">
            To see who's out and where the night is, add at least 2 friends or invite someone to join.
          </p>
        </div>

        {/* Progress indicator */}
        <div className={`text-center py-3 px-4 rounded-xl mb-6 ${
          requirementMet 
            ? 'bg-green-500/20 border border-green-500/40' 
            : 'bg-white/[0.06] backdrop-blur-sm'
        }`}>
          <p className={`text-sm font-medium ${requirementMet ? 'text-green-400' : 'text-white/80'}`}>
            {getProgressText()}
          </p>
          {!requirementMet && (
            <div className="flex justify-center gap-4 mt-2 text-xs text-white/50">
              <span>Friends added: {friendsAddedCount}/{REQUIRED_FRIENDS}</span>
              <span>•</span>
              <span>Invites sent: {inviteSentCount}/{REQUIRED_INVITES}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">
          {/* Share Your Invite Link - Primary CTA */}
           <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#a855f7] flex items-center justify-center">
                <Link2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Share Your Invite Link</h3>
                <p className="text-white/60 text-sm">Text or DM your link to friends</p>
              </div>
            </div>

            {loading ? (
              <div className="h-12 bg-[#1a0f2e] rounded-xl animate-pulse" />
            ) : (
              <>
                <div className="flex items-center gap-2 bg-[#1a0f2e] border border-white/20 rounded-xl p-3">
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

                <Button
                  onClick={handleShare}
                  className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold rounded-full py-6"
                >
                  <Share2 className="h-5 w-5 mr-2" />
                  Share with Friends
                </Button>
              </>
            )}
          </div>

          {/* Search by Username */}
           <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#a855f7]/30 flex items-center justify-center">
                <Search className="h-6 w-6 text-[#a855f7]" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Find Friends on Spotted</h3>
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
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center gap-3 p-3 bg-[#1a0f2e] rounded-xl"
                  >
                    <Avatar className="h-10 w-10 border border-white/20">
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
                      disabled={sentRequests.has(result.id)}
                      className={sentRequests.has(result.id) 
                        ? "bg-green-500/20 text-green-400 border-green-500/40"
                        : "bg-[#a855f7] hover:bg-[#a855f7]/80 text-white"
                      }
                    >
                      {sentRequests.has(result.id) ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Sent
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-white/50 text-sm text-center py-2">
                No users found. Invite them with your link!
              </p>
            )}
          </div>

          {/* QR Code Button */}
          <button
            onClick={() => setShowQRModal(true)}
            className="w-full bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 flex items-center gap-3 hover:bg-white/[0.10] transition-colors"
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

        {/* Bottom Buttons */}
        <div className="pt-6 pb-8 space-y-3">
          <Button
            onClick={handleContinue}
            disabled={!requirementMet}
            className={`w-full font-semibold text-lg py-6 rounded-full transition-all ${
              requirementMet
                ? 'bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            Continue
          </Button>
          <button
            onClick={handleSkipAttempt}
            className="w-full text-white/60 hover:text-white py-2 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>

      {/* QR Code Modal */}
      <QRCodeModal
        open={showQRModal}
        onOpenChange={setShowQRModal}
        inviteUrl={getInviteUrl()}
      />

      {/* Skip Confirmation Modal */}
      <Dialog 
        open={showSkipConfirmation} 
        onOpenChange={(open) => {
          // Don't allow closing if skip is in progress
          if (!skipInProgress) {
            setShowSkipConfirmation(open);
          }
        }}
      >
        <DialogContent className="max-w-[340px] bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl p-6 z-[500]" aria-describedby={undefined}>
          <VisuallyHidden>
            <DialogTitle>Skip Confirmation</DialogTitle>
          </VisuallyHidden>
          <div className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="h-7 w-7 text-amber-400" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-3">
              Spotted works best with friends
            </h2>
            
            <p className="text-white/70 text-sm mb-6">
              Without friends, you won't see who's out or get updates on your night. Are you sure you want to continue?
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => setShowSkipConfirmation(false)}
                disabled={skipInProgress}
                className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold rounded-full py-5"
              >
                Add Friends First
              </Button>
              <button
                onClick={handleConfirmSkip}
                disabled={skipInProgress}
                className="w-full text-white/50 hover:text-white py-2 transition-colors text-sm disabled:opacity-50"
              >
                {skipInProgress ? 'Please wait...' : 'Skip anyway'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
