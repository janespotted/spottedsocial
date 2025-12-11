import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link2, Copy, Share2, Search, UserPlus, QrCode, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { QRCodeModal } from '@/components/QRCodeModal';

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

export function FindFriendsOnboarding({ onComplete, onSkip }: FindFriendsOnboardingProps) {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
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

  const getInviteUrl = () => `${window.location.origin}/invite/${inviteCode}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getInviteUrl());
      haptic.light();
      toast.success('Link copied!');
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
      } catch (error) {
        // User cancelled
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
      haptic.success();
      toast.success('Friend request sent!');
    } catch (error) {
      toast.error('Failed to send request');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex items-center justify-center overflow-y-auto">
      <div className="w-full max-w-[430px] min-h-full flex flex-col p-6">
        {/* Header */}
        <div className="text-center mb-8 pt-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Bring Your Friends 🎉
          </h1>
          <p className="text-white/70">
            Spotted is better with friends
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* Share Your Invite Link - Primary CTA */}
          <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/40 rounded-2xl p-5 space-y-4">
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
          <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/40 rounded-2xl p-5 space-y-4">
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
            className="w-full bg-[#2d1b4e]/60 border border-[#a855f7]/40 rounded-2xl p-5 flex items-center gap-3 hover:bg-[#a855f7]/10 transition-colors"
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
            onClick={onComplete}
            className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold text-lg py-6 rounded-full"
          >
            Continue
          </Button>
          <button
            onClick={onSkip}
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
    </div>
  );
}
