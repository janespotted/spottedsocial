import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';

interface DailyNudgeModalProps {
  open: boolean;
  onClose: () => void;
  nudgeType: 'first' | 'second';
}

export function DailyNudgeModal({ open, onClose, nudgeType }: DailyNudgeModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleResponse = async (response: string) => {
    if (!user) return;
    
    setLoading(true);
    haptic.light();

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Determine new status based on response
      let newStatus: 'planning' | 'off' = 'off';
      if (response === 'going_out' || response === 'maybe' || response === 'still_going') {
        newStatus = 'planning';
      }

      // Upsert daily_nudges record
      const nudgeData = {
        user_id: user.id,
        nudge_date: today,
        first_nudge_response: nudgeType === 'first' ? response : undefined,
        first_nudge_sent_at: nudgeType === 'first' ? new Date().toISOString() : undefined,
        second_nudge_response: nudgeType === 'second' ? response : undefined,
        second_nudge_sent_at: nudgeType === 'second' ? new Date().toISOString() : undefined,
      };

      const { error: nudgeError } = await supabase
        .from('daily_nudges')
        .upsert(nudgeData, { onConflict: 'user_id,nudge_date' });

      if (nudgeError) throw nudgeError;

      // Update night_statuses
      const { error: statusError } = await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: newStatus,
          updated_at: new Date().toISOString(),
          expires_at: getExpiryTime(),
        }, { onConflict: 'user_id' });

      if (statusError) throw statusError;

      // Handle navigation based on response
      if (response === 'still_going') {
        // Deep-link to Plans tab
        navigate('/?tab=plans');
        toast.success('Let\'s make a plan! 🎉');
      } else if (response === 'going_out' || response === 'maybe') {
        toast.success('You\'re in the mix! 👀');
      } else {
        toast.success('Enjoy your night in! 🛋️');
      }

      onClose();
    } catch (error) {
      console.error('Error handling nudge response:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Get 5am expiry time for tonight/tomorrow
  const getExpiryTime = () => {
    const now = new Date();
    const expiry = new Date(now);
    
    // If before 5am, expire at 5am today
    // If after 5am, expire at 5am tomorrow
    if (now.getHours() < 5) {
      expiry.setHours(5, 0, 0, 0);
    } else {
      expiry.setDate(expiry.getDate() + 1);
      expiry.setHours(5, 0, 0, 0);
    }
    
    return expiry.toISOString();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-[#a855f7]/30 max-w-[380px] p-6">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <span className="text-4xl">
              {nudgeType === 'first' ? '👀' : '✨'}
            </span>
            <h2 className="text-xl font-semibold text-white">
              {nudgeType === 'first' 
                ? 'Are you planning on going out later?' 
                : 'Still going out tonight?'}
            </h2>
          </div>

          {/* Buttons */}
          <div className="w-full space-y-3">
            {nudgeType === 'first' ? (
              <>
                <Button
                  onClick={() => handleResponse('going_out')}
                  disabled={loading}
                  className="w-full h-14 text-lg font-semibold bg-[#a855f7] hover:bg-[#9333ea] text-white rounded-2xl shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                >
                  I'm going out 🎉
                </Button>
                <Button
                  onClick={() => handleResponse('maybe')}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-14 text-lg font-semibold border-[#a855f7]/50 text-white hover:bg-[#a855f7]/20 rounded-2xl"
                >
                  Maybe 🤔
                </Button>
                <Button
                  onClick={() => handleResponse('staying_in')}
                  disabled={loading}
                  variant="ghost"
                  className="w-full h-12 text-base text-white/60 hover:text-white hover:bg-white/5 rounded-2xl"
                >
                  Staying in 🛋️
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => handleResponse('still_going')}
                  disabled={loading}
                  className="w-full h-14 text-lg font-semibold bg-[#a855f7] hover:bg-[#9333ea] text-white rounded-2xl shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                >
                  Yep, still going ✨
                </Button>
                <Button
                  onClick={() => handleResponse('staying_in')}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-14 text-lg font-semibold border-[#a855f7]/50 text-white hover:bg-[#a855f7]/20 rounded-2xl"
                >
                  Nah, staying in
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
