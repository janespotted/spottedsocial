import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Home, MessageCircle, X, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';

interface PrivatePartyCardProps {
  hostId: string;
  hostName: string;
  hostAvatarUrl: string | null;
  neighborhood: string;
  friendsAtParty?: { userId: string; displayName: string; avatarUrl: string | null }[];
  onClose: () => void;
}

export function PrivatePartyCard({
  hostId,
  hostName,
  hostAvatarUrl,
  neighborhood,
  friendsAtParty = [],
  onClose,
}: PrivatePartyCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isRequesting, setIsRequesting] = useState(false);

  const handleAskForAddress = async () => {
    if (!user) return;
    setIsRequesting(true);

    try {
      // Get current user's name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const myName = profile?.display_name?.split(' ')[0] || 'Someone';

      // Send address request notification
      await supabase.rpc('create_notification', {
        p_receiver_id: hostId,
        p_type: 'address_request',
        p_message: `${myName} wants to come to your party! 🏠`,
      });

      haptic.success();
      toast.success('Address request sent!');
      onClose();
    } catch (error) {
      console.error('Error sending address request:', error);
      toast.error('Failed to send request');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleOpenChat = () => {
    navigate('/messages', {
      state: {
        preselectedUser: {
          userId: hostId,
          displayName: hostName,
          avatarUrl: hostAvatarUrl,
        }
      }
    });
    onClose();
  };

  return (
    <Card className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[100] max-w-[400px] mx-auto bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/95 to-[#0a0118]/95 backdrop-blur-xl border-2 border-[#a855f7]/40 rounded-3xl shadow-[0_0_30px_rgba(168,85,247,0.3)] overflow-hidden">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
      >
        <X className="h-5 w-5 text-white" />
      </button>

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#a855f7]/20 flex items-center justify-center">
            <Home className="h-7 w-7 text-[#a855f7]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Private Party</h2>
            <div className="flex items-center gap-1.5 text-[#a855f7]">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{neighborhood}</span>
            </div>
          </div>
        </div>

        {/* Host info */}
        <div className="flex items-center gap-3 p-3 bg-[#2d1b4e]/50 rounded-xl">
          <Avatar className="w-10 h-10 border-2 border-[#d4ff00]">
            <AvatarImage src={hostAvatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${hostName}`} />
            <AvatarFallback className="bg-[#a855f7] text-white">
              {hostName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className="text-white font-medium">{hostName}</span>
            <span className="text-[#d4ff00] text-sm block">Host</span>
          </div>
        </div>

        {/* Friends at party */}
        {friendsAtParty.length > 0 && (
          <div>
            <p className="text-white/60 text-sm mb-2">Also here ({friendsAtParty.length})</p>
            <ScrollArea className="max-h-[100px]">
              <div className="flex gap-2 flex-wrap">
                {friendsAtParty.map(friend => (
                  <Avatar key={friend.userId} className="w-8 h-8 border border-[#a855f7]">
                    <AvatarImage src={friend.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.displayName}`} />
                    <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                      {friend.displayName[0]}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Privacy note */}
        <p className="text-white/40 text-xs text-center">
          Address only shared via DM
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleOpenChat}
            variant="outline"
            className="flex-1 h-12 rounded-2xl border-[#a855f7]/30 bg-[#a855f7]/10 text-white hover:bg-[#a855f7]/20"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Message
          </Button>
          <Button
            onClick={handleAskForAddress}
            disabled={isRequesting}
            className="flex-1 h-12 rounded-2xl bg-gradient-to-b from-[#f0ff80] to-[#d4ff00] text-[#0a0118] font-semibold hover:from-[#f5ffb3] hover:to-[#e5ff4d]"
          >
            {isRequesting ? 'Sending...' : '💬 Ask for address'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
