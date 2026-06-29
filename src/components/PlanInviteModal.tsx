import { useState } from 'react';
import { MapPin, Calendar, Clock, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface PlanInviteData {
  planId: string;
  inviterName: string;
  inviterAvatarUrl: string | null;
  venueName: string;
  planDate: string;
  planTime: string;
}

interface PlanInviteModalProps {
  open: boolean;
  invite: PlanInviteData | null;
  onClose: () => void;
}

export function PlanInviteModal({ open, invite, onClose }: PlanInviteModalProps) {
  const { user } = useAuth();
  const [responding, setResponding] = useState(false);

  if (!invite) return null;

  const formattedDate = (() => {
    try {
      return format(parseISO(invite.planDate), 'EEEE, MMM d');
    } catch {
      return invite.planDate;
    }
  })();

  const formattedTime = (() => {
    try {
      const [h, m] = invite.planTime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m);
      return format(d, 'h:mm a');
    } catch {
      return invite.planTime;
    }
  })();

  const handleAccept = async () => {
    if (!user || responding) return;
    setResponding(true);
    try {
      await supabase.from('plan_downs').upsert({
        plan_id: invite.planId,
        user_id: user.id,
      }, { onConflict: 'plan_id,user_id' });

      haptic.success();
      toast.success("You're in!");
      onClose();
    } catch (err) {
      console.error('Accept plan error:', err);
      toast.error('Something went wrong');
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = () => {
    haptic.light();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[301] max-w-[380px] mx-auto"
          >
            <div className="bg-[#1a0f2e] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="px-6 pt-8 pb-6">
                {/* Avatar + invite text */}
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 rounded-full p-[2px] flex-shrink-0" style={{ background: 'linear-gradient(135deg, #a855f7, #d4ff00)' }}>
                    <Avatar className="w-full h-full border-2 border-[#1a0f2e]">
                      <AvatarImage src={invite.inviterAvatarUrl || undefined} />
                      <AvatarFallback className="bg-[#2d1b4e] text-white text-lg">
                        {invite.inviterName[0]}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-white text-[17px] leading-snug">
                      <span className="font-bold text-[#d4ff00]">{invite.inviterName}</span>
                      {' '}invited you to their plans at
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-[#d4ff00]" />
                      <span className="text-[#d4ff00] font-semibold text-[15px]">{invite.venueName}</span>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06] mb-5" />

                {/* Date & Time */}
                <div className="space-y-3 mb-8">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-white/40" />
                    <span className="text-white text-[15px]">{formattedDate}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-white/40" />
                    <span className="text-white text-[15px]">{formattedTime}</span>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleDecline}
                    disabled={responding}
                    className="flex-1 h-12 rounded-full border border-white/10 text-white/70 font-medium text-[15px] hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={responding}
                    className="flex-1 h-12 rounded-full bg-[#d4ff00] text-[#0a0118] font-semibold text-[15px] hover:bg-[#d4ff00]/90 transition-colors disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
