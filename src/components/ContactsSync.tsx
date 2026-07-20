import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isNativePlatform } from '@/lib/platform';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { UserPlus, Send, Check, Loader2, Contact, Users, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { getOrCreateInviteCode, getInviteLink, triggerSmsInvite } from '@/lib/sms-invite';

interface ContactMatch {
  phone: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  contactName?: string;
}

interface ContactToInvite {
  name: string;
  phone: string;
}

interface ContactsSyncProps {
  open: boolean;
  onClose: () => void;
}

export function ContactsSync({ open, onClose }: ContactsSyncProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [inviteable, setInviteable] = useState<ContactToInvite[]>([]);
  const [sentRequests, setSentRequests] = useState<globalThis.Set<string>>(new globalThis.Set());
  const [invited, setInvited] = useState<globalThis.Set<string>>(new globalThis.Set());
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [step, setStep] = useState<'prompt' | 'loading' | 'results'>('prompt');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setStep('prompt');
      setSearchQuery('');
    }
  }, [open]);

  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) return matches;
    const q = searchQuery.toLowerCase();
    return matches.filter(m =>
      m.display_name.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      (m.contactName && m.contactName.toLowerCase().includes(q))
    );
  }, [matches, searchQuery]);

  const filteredInviteable = useMemo(() => {
    if (!searchQuery.trim()) return inviteable;
    const q = searchQuery.toLowerCase();
    return inviteable.filter(c => c.name.toLowerCase().includes(q));
  }, [inviteable, searchQuery]);

  const requestContacts = async () => {
    setStep('loading');
    setLoading(true);
    try {
      if (isNativePlatform()) {
        await syncNativeContacts();
      } else {
        setHasPermission(false);
        setStep('results');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Contacts sync error:', err);
      setHasPermission(err.message?.includes('denied') ? false : null);
      if (!err.message?.includes('denied')) toast.error('Could not access contacts');
      setStep('results');
    } finally {
      setLoading(false);
    }
  };

  const syncNativeContacts = async () => {
    const { Contacts } = await import('@capacitor-community/contacts');
    const permResult = await Contacts.requestPermissions();
    if (permResult.contacts !== 'granted') {
      setHasPermission(false);
      setStep('results');
      return;
    }
    setHasPermission(true);

    const { contacts } = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });

    const phoneToName: Record<string, string> = {};
    for (const contact of contacts) {
      const name = contact.name?.display || contact.name?.given || 'Unknown';
      for (const phone of contact.phones || []) {
        if (phone.number) {
          const normalized = phone.number.replace(/[^\d]/g, '');
          if (normalized.length === 10) phoneToName['1' + normalized] = name;
          else if (normalized.length === 11 && normalized.startsWith('1')) phoneToName[normalized] = name;
        }
      }
    }

    const uniquePhones = Object.keys(phoneToName);
    if (uniquePhones.length === 0) { setStep('results'); return; }

    const { data, error } = await supabase.functions.invoke('match-contacts', {
      body: { phones: uniquePhones },
    });
    if (error) { toast.error('Could not sync contacts'); setStep('results'); return; }

    const existingFriends = new globalThis.Set<string>();
    if (user && data.matches?.length > 0) {
      const [{ data: sent }, { data: recv }] = await Promise.all([
        supabase.from('friendships').select('friend_id, status').eq('user_id', user.id),
        supabase.from('friendships').select('user_id, status').eq('friend_id', user.id),
      ]);
      for (const f of sent || []) existingFriends.add(f.friend_id);
      for (const f of recv || []) existingFriends.add(f.user_id);
    }

    setMatches(
      (data.matches || [])
        .map((m: any) => ({ ...m, contactName: phoneToName[m.phone] || m.display_name }))
        .filter((m: ContactMatch) => !existingFriends.has(m.user_id))
    );
    setInviteable(
      (data.nonMatches || [])
        .filter((phone: string) => phoneToName[phone])
        .map((phone: string) => ({ name: phoneToName[phone], phone }))
    );

    const alreadySent = new globalThis.Set<string>();
    if (user) {
      const { data: pending } = await supabase
        .from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'pending');
      for (const p of pending || []) alreadySent.add(p.friend_id);
    }
    setSentRequests(alreadySent);
    setStep('results');
  };

  const handleAddFriend = async (e: React.MouseEvent, match: ContactMatch) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user || sentRequests.has(match.user_id)) return;
    haptic.light();

    const { error } = await supabase.from('friendships').insert({
      user_id: user.id, friend_id: match.user_id, status: 'pending',
    });

    if (error) {
      if (error.code === '23505') toast.info('Request already sent');
      else toast.error('Could not send request');
    } else {
      toast.success(`Request sent to ${match.display_name}`);
    }
    setSentRequests(prev => { const n = new globalThis.Set(prev); n.add(match.user_id); return n; });
  };

  const handleInvite = async (e: React.MouseEvent, contact: ContactToInvite) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user || invited.has(contact.phone)) return;
    haptic.light();

    try {
      const code = await getOrCreateInviteCode(user.id);
      const link = getInviteLink(code);
      const { data: profile } = await supabase
        .from('profiles').select('display_name').eq('id', user.id).single();

      const senderName = profile?.display_name || 'Your friend';
      const message = `${senderName} invited you to Spotted — see where your friends are going out tonight! 🎉\n\n${link}`;
      const phoneNumber = contact.phone.startsWith('1') ? `+${contact.phone}` : `+1${contact.phone}`;

      // Open SMS compose directly to this person's number
      const smsBody = encodeURIComponent(message);
      window.open(`sms:${phoneNumber}&body=${smsBody}`, '_self');

      setInvited(prev => { const n = new globalThis.Set(prev); n.add(contact.phone); return n; });
    } catch (err) {
      console.error('Invite failed:', err);
      toast.error('Failed to create invite');
    }
  };

  const handleAddAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    haptic.medium();
    let count = 0;
    for (const match of matches) {
      if (sentRequests.has(match.user_id)) continue;
      const { error } = await supabase.from('friendships').insert({
        user_id: user.id, friend_id: match.user_id, status: 'pending',
      });
      if (!error) count++;
    }
    setSentRequests(prev => {
      const n = new globalThis.Set(prev);
      for (const m of matches) n.add(m.user_id);
      return n;
    });
    toast.success(`Sent ${count} friend request${count !== 1 ? 's' : ''}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center bg-black/60 px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)' }} onClick={onClose}>
      {/* Modal — stop clicks inside from closing */}
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-sm bg-[#1a0f2e]/95 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col max-h-[70vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Find Friends</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'prompt' && (
          <div className="px-5 pb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
              <Contact className="w-8 h-8 text-[#a855f7]" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">See who's already here</h3>
            <p className="text-white/50 text-sm mb-6">
              We'll check your contacts to find friends on Spotted. Your contact info stays on your device.
            </p>
            <button
              type="button"
              onClick={requestContacts}
              className="w-full h-12 bg-[#d4ff00] text-black font-semibold rounded-2xl active:bg-[#d4ff00]/80 flex items-center justify-center gap-2"
            >
              <Users className="w-5 h-5" />
              Sync Contacts
            </button>
            <button type="button" onClick={onClose} className="mt-3 text-white/40 text-sm">
              skip for now
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div className="px-5 pb-8 text-center">
            <Loader2 className="w-10 h-10 text-[#d4ff00] animate-spin mx-auto mb-4" />
            <p className="text-white/60 text-sm">Checking your contacts...</p>
          </div>
        )}

        {step === 'results' && (
          <>
            {/* Web fallback */}
            {!isNativePlatform() && hasPermission === false && (
              <div className="px-5 pb-6 text-center">
                <p className="text-white/50 text-sm mb-4">
                  Contact sync is only available on the mobile app. Share your invite link instead:
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!user) return;
                    try {
                      const code = await getOrCreateInviteCode(user.id);
                      const link = getInviteLink(code);
                      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
                      await triggerSmsInvite({ senderName: profile?.display_name || 'Your friend', inviteLink: link });
                    } catch (err) {
                      console.error('Invite failed:', err);
                      toast.error('Failed to create invite');
                    }
                  }}
                  className="w-full h-11 bg-[#a855f7] text-white font-medium rounded-xl flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Share Invite Link
                </button>
              </div>
            )}

            {isNativePlatform() && hasPermission === false && (
              <div className="px-5 pb-6 text-center">
                <p className="text-white/50 text-sm">
                  Contact access was denied. Enable it in Settings → Spotted → Contacts.
                </p>
              </div>
            )}

            {/* Search bar */}
            {hasPermission && (matches.length > 0 || inviteable.length > 0) && (
              <div className="px-5 pb-3 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contacts..."
                    className="pl-9 h-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Scrollable results */}
            <div className="overflow-y-auto flex-1 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="px-5 pb-5">
                {/* Matches */}
                {filteredMatches.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-white/70 text-xs font-medium uppercase tracking-wider">
                        On Spotted ({filteredMatches.length})
                      </p>
                      {filteredMatches.length > 1 && filteredMatches.some(m => !sentRequests.has(m.user_id)) && (
                        <button type="button" onClick={(e) => handleAddAll(e)} className="text-[#d4ff00] text-xs font-medium">
                          Add All
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {filteredMatches.map((match) => {
                        const isSent = sentRequests.has(match.user_id);
                        return (
                          <div key={match.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                            <Avatar className="w-10 h-10 border-2 border-[#a855f7]/40 flex-shrink-0">
                              <AvatarImage src={match.avatar_url || undefined} />
                              <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                                {match.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium text-sm truncate">{match.display_name}</p>
                              <p className="text-white/40 text-xs truncate">
                                @{match.username}
                                {match.contactName && match.contactName !== match.display_name && (
                                  <> · {match.contactName}</>
                                )}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleAddFriend(e, match)}
                              className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium flex-shrink-0 ${
                                isSent
                                  ? 'bg-white/10 text-white/40'
                                  : 'bg-[#a855f7] text-white active:scale-95'
                              }`}
                            >
                              {isSent ? <><Check className="w-3.5 h-3.5" /> Sent</> : <><UserPlus className="w-3.5 h-3.5" /> Add</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Invite */}
                {filteredInviteable.length > 0 && (
                  <div>
                    <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-3">
                      Invite to Spotted ({filteredInviteable.length})
                    </p>
                    <div className="space-y-2">
                      {filteredInviteable.map((contact) => {
                        const isInvited = invited.has(contact.phone);
                        return (
                          <div key={contact.phone} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 font-medium text-sm flex-shrink-0">
                              {contact.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white/80 font-medium text-sm truncate">{contact.name}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleInvite(e, contact)}
                              className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border flex-shrink-0 ${
                                isInvited
                                  ? 'bg-white/5 border-white/10 text-white/40'
                                  : 'bg-transparent border-white/20 text-white active:scale-95 active:bg-white/10'
                              }`}
                            >
                              {isInvited ? <><Check className="w-3.5 h-3.5" /> Invited</> : <><Send className="w-3.5 h-3.5" /> Invite</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty */}
                {hasPermission && filteredMatches.length === 0 && filteredInviteable.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-white/50 text-sm">
                      {searchQuery ? 'No contacts match your search' : 'No contacts found'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
