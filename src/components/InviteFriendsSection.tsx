import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Link2, Copy, Share2, RefreshCw, Users, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function InviteFriendsSection() {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [usesCount, setUsesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchOrCreateInviteCode();
    }
  }, [user]);

  const fetchOrCreateInviteCode = async () => {
    try {
      // Try to get existing invite code
      const { data: existingCode, error: fetchError } = await supabase
        .from('invite_codes')
        .select('code, uses_count')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCode) {
        setInviteCode(existingCode.code);
        setUsesCount(existingCode.uses_count);
        setLoading(false);
        return;
      }

      // Create a new invite code if none exists
      await generateNewCode();
    } catch (error) {
      console.error('Error fetching invite code:', error);
      setLoading(false);
    }
  };

  const generateNewCode = async () => {
    setGenerating(true);
    try {
      // Generate a random 8-character code
      const newCode = generateRandomCode();

      const { data, error } = await supabase
        .from('invite_codes')
        .insert({
          user_id: user?.id,
          code: newCode,
        })
        .select('code, uses_count')
        .single();

      if (error) throw error;

      setInviteCode(data.code);
      setUsesCount(data.uses_count);
      haptic.success();
      toast.success('New invite link generated!');
    } catch (error: any) {
      toast.error('Failed to generate invite code');
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const getInviteUrl = () => {
    return `${APP_BASE_URL}/invite/${inviteCode}`;
  };

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(getInviteUrl());
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
      // Fallback to copy
      handleCopyLink();
    }
  };

  if (loading) {
    return (
      <div className="bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#a855f7]/20" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[#a855f7]/20 rounded w-24" />
            <div className="h-3 bg-[#a855f7]/10 rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4">
        {/* Header - Clickable Trigger */}
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#a855f7] flex items-center justify-center">
              <Link2 className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-white">Invite Friends</h3>
              <p className="text-white/60 text-sm">Share your link to add friends instantly</p>
            </div>
            <ChevronDown 
              className={`h-5 w-5 text-white/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
            />
          </div>
        </CollapsibleTrigger>

        {/* Collapsible Content */}
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Link Display */}
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

          {/* Action Buttons */}
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

          {/* Stats */}
          {usesCount > 0 && (
            <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
              <Users className="h-4 w-4" />
              <span>{usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link</span>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
