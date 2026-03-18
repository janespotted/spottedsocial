import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { isNativePlatform } from '@/lib/platform';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/UjWqvyCX';

interface InviterInfo {
  display_name: string;
  avatar_url: string | null;
  username: string;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  inviter_display_name?: string;
  inviter_avatar_url?: string | null;
  inviter_username?: string;
}

export default function InviteLanding() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code) {
      fetchInviteInfo();
    }
  }, [code]);

  const fetchInviteInfo = async () => {
    try {
      // Use the secure validation function instead of direct table queries
      const { data, error: rpcError } = await supabase
        .rpc('validate_invite_code', { code_to_check: code });

      if (rpcError) {
        console.error('Validation error:', rpcError);
        setError('Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      const result = data as unknown as ValidationResult;

      if (!result || !result.valid) {
        // Map reason to user-friendly message
        let errorMessage = 'This invite link is invalid or has expired.';
        if (result.reason === 'Code expired') {
          errorMessage = 'This invite link has expired.';
        } else if (result.reason === 'Code fully used') {
          errorMessage = 'This invite link has reached its maximum uses.';
        } else if (result.reason === 'Inviter not found') {
          errorMessage = 'Could not find the inviter.';
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Set inviter info from the secure function response
      setInviter({
        display_name: result.inviter_display_name || 'Someone',
        avatar_url: result.inviter_avatar_url || null,
        username: result.inviter_username || ''
      });
      setLoading(false);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  const handleJoin = () => {
    // If already in the native app, navigate directly
    if (isNativePlatform()) {
      navigate(`/auth?invite=${code}`);
      return;
    }

    // On iOS web: redirect to TestFlight to install the app
    if (isIOS) {
      window.location.href = TESTFLIGHT_URL;
      return;
    }

    // Non-iOS web: proceed with web auth flow
    navigate(`/auth?invite=${code}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#a855f7] border-t-transparent mx-auto mb-4"></div>
          <p className="text-white/60">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
        <Card className="w-full max-w-[430px] mx-auto border-2 border-[#a855f7]/40 shadow-[0_0_30px_rgba(168,85,247,0.4)] bg-[#0a0118] rounded-3xl">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 rounded-full bg-[#2d1b4e] flex items-center justify-center mx-auto mb-6 border border-[#a855f7]/40">
              <Users className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Invalid Invite</h1>
            <p className="text-white/60 mb-6">{error}</p>
            <Button
              onClick={() => navigate('/auth')}
              className="bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.6)] text-white"
            >
              Sign Up Anyway
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <Card className="w-full max-w-[430px] mx-auto border-2 border-[#a855f7]/40 shadow-[0_0_30px_rgba(168,85,247,0.4)] bg-[#0a0118] rounded-3xl">
        <CardContent className="pt-8 pb-8 text-center">
          {/* Spotted Logo */}
          <h1 className="text-4xl font-light tracking-[0.3em] text-white mb-8">
            Spotted
          </h1>

          {/* Inviter Avatar */}
          <Avatar className="h-24 w-24 mx-auto mb-4 border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.8)]">
            <AvatarImage src={inviter?.avatar_url || undefined} />
            <AvatarFallback className="bg-[#1a0f2e] text-white text-3xl">
              {inviter?.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>

          {/* Invite Message */}
          <h2 className="text-2xl font-bold text-white mb-2">
            {inviter?.display_name} invited you!
          </h2>
          <p className="text-white/60 mb-8">
            Join Spotted to see where your friends are going out tonight 🎉
          </p>

          {/* Join Button */}
          <Button
            onClick={handleJoin}
            className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.6)] hover:shadow-[0_0_25px_rgba(168,85,247,0.8)] transition-all text-white font-semibold text-lg py-6"
          >
            {isIOS && !isNativePlatform()
              ? 'Get Spotted on TestFlight'
              : `Join ${inviter?.display_name?.split(' ')[0]} on Spotted`}
          </Button>

          <p className="text-white/40 text-sm mt-4">
            {isIOS && !isNativePlatform()
              ? 'Install the app, then tap this link again to connect'
              : "You'll automatically become friends after signing up"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}