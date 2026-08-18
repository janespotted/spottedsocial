import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ContactsSync } from '@/components/ContactsSync';
import { ChevronRight, MessageCircle, Copy, Check, Contact } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import { toast } from 'sonner';

export function InviteBlock() {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [usesCount, setUsesCount] = useState(0);
  const [justCopied, setJustCopied] = useState(false);
  const [showContactsSync, setShowContactsSync] = useState(false);

  useEffect(() => {
    if (user) fetchOrCreateInviteCode();
  }, [user]);

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
        return;
      }

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
    } catch (error) {
      console.error('Error fetching invite code:', error);
    }
  };

  const getInviteUrl = () => `${APP_BASE_URL}/invite/${inviteCode}`;

  const handleTextFriend = () => {
    const message = encodeURIComponent(
      `Hey! Join me on Spotted to see where friends are going out tonight 🎉 ${getInviteUrl()}`
    );
    haptic.light();
    window.location.href = `sms:?&body=${message}`;
  };

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(getInviteUrl());
      haptic.light();
      setJustCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <>
      {/* Find from Contacts */}
      <section>
        <h2 className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">Find friends</h2>
        <button
          onClick={() => setShowContactsSync(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#a855f7]/10 to-[#d4ff00]/5 border border-[#a855f7]/20 hover:border-[#a855f7]/40 transition-colors mb-4"
        >
          <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
            <Contact className="h-5 w-5 text-[#a855f7]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-white text-sm font-medium">Find from Contacts</p>
            <p className="text-white/30 text-xs">See who's already on Spotted</p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/20" />
        </button>
      </section>

      {/* Invite Section */}
      <section>
        <h2 className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">Invite friends</h2>
        <div className="space-y-2">
          <button
            onClick={handleTextFriend}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] pressable-row"
          >
            <div className="w-10 h-10 rounded-full bg-[#d4ff00]/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-[#d4ff00]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white text-sm font-medium">Text a friend</p>
              <p className="text-white/30 text-xs">Send your invite link via iMessage</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/20" />
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] pressable-row"
          >
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              {justCopied ? <Check className="h-5 w-5 text-[#22c55e]" /> : <Copy className="h-5 w-5 text-white/50" />}
            </div>
            <div className="flex-1 text-left">
              <p className="text-white text-sm font-medium">{justCopied ? 'Link copied' : 'Copy invite link'}</p>
              <p className="text-white/30 text-xs">Share anywhere</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/20" />
          </button>
        </div>

        {usesCount > 0 && (
          <p className="text-white/25 text-xs text-center mt-3">
            {usesCount} friend{usesCount !== 1 ? 's' : ''} joined via your link
          </p>
        )}
      </section>

      <ContactsSync open={showContactsSync} onClose={() => setShowContactsSync(false)} />
    </>
  );
}
