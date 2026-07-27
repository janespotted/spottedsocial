import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { stopSharing, goOutAtVenue, goPlanning } from '@/lib/night-status';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { MapPin, Target, Home, MapPinOff } from 'lucide-react';

interface QuickStatusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedVenue?: { id: string; name: string; lat: number; lng: number } | null;
}

export function QuickStatusSheet({ open, onOpenChange, suggestedVenue }: QuickStatusSheetProps) {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentVenue, setCurrentVenue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user?.id) {
      fetchCurrentStatus();
    }
  }, [open, user?.id]);

  const fetchCurrentStatus = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('status, venue_name')
      .eq('user_id', user!.id)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    setCurrentStatus(data?.status || null);
    setCurrentVenue(data?.venue_name || null);
  };

  const handleGoLive = async () => {
    if (!user) return;

    if (suggestedVenue) {
      setLoading(true);
      haptic.medium();

      try {
        await goOutAtVenue(user.id, {
          venue: { id: suggestedVenue.id, name: suggestedVenue.name },
          coords: { lat: suggestedVenue.lat, lng: suggestedVenue.lng },
          source: 'manual',
        });

        toast.success(`You're live at ${suggestedVenue.name}! 🎉`);
        onOpenChange(false);
      } catch (error) {
        console.error('Error going live:', error);
        toast.error('Something went wrong');
      } finally {
        setLoading(false);
      }
      return;
    }

    onOpenChange(false);
    openCheckIn();
  };

  const handlePlanning = async () => {
    if (!user) return;
    setLoading(true);
    haptic.light();

    try {
      await goPlanning(user.id);

      toast.success('You\'re TBD for tonight 🤔');
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleStayingIn = async () => {
    if (!user) return;
    setLoading(true);
    haptic.light();

    try {
      await stopSharing(user.id);

      toast.success('Enjoy your night in! 🛋️');
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSharing = async () => {
    if (!user) return;
    setLoading(true);
    haptic.medium();

    try {
      await stopSharing(user.id);

      toast.success('Location sharing stopped. Your friends can no longer see you.');
      onOpenChange(false);
    } catch (error) {
      console.error('Error stopping sharing:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const isSharing = currentStatus === 'out';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-[#1a0f2e] border-[#a855f7]/30">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">Update Your Status</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-3">
          {currentStatus && (
            <div className="text-center mb-4">
              <span className="text-white/40 text-xs uppercase tracking-wider">Currently: </span>
              <span className="text-white/60 text-xs">
                 {currentStatus === 'out' ? `🟢 Out${currentVenue ? ` · ${currentVenue}` : ''}` :
                 currentStatus === 'planning' ? 'TBD' :
                 'Staying in'}
              </span>
            </div>
          )}

          {suggestedVenue && (
            <div className="bg-white/[0.06] border border-white/20 rounded-xl p-3 mb-2 text-center">
              <p className="text-white text-sm font-medium flex items-center justify-center gap-1"><MapPin className="h-4 w-4 text-[#d4ff00]" /> You're near {suggestedVenue.name}</p>
            </div>
          )}

          <Button
            onClick={handleGoLive}
            disabled={loading}
            className="w-full h-14 text-lg font-semibold bg-[#d4ff00] hover:bg-[#d4ff00]/90 text-[#0a0118] rounded-2xl"
          >
            <MapPin className="w-5 h-5 mr-2" />
            Yes, I'm out
          </Button>

          <Button
            onClick={handlePlanning}
            disabled={loading}
            variant="outline"
            className="w-full h-14 text-lg font-semibold border-[#a855f7]/50 text-white hover:bg-[#a855f7]/20 rounded-2xl"
          >
            <Target className="w-5 h-5 mr-2" />
            TBD
          </Button>

          <Button
            onClick={handleStayingIn}
            disabled={loading}
            variant="ghost"
            className="w-full h-12 text-base text-white/60 hover:text-white hover:bg-white/5 rounded-2xl"
          >
            <Home className="w-4 h-4 mr-2" />
            Staying in
          </Button>

          {/* Stop Sharing option — only visible when actively sharing */}
          {isSharing && (
            <>
              <div className="border-t border-white/10 my-2" />
              <Button
                onClick={handleStopSharing}
                disabled={loading}
                variant="ghost"
                className="w-full h-12 text-base text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-2xl"
              >
                <MapPinOff className="w-4 h-4 mr-2" />
                Stop Sharing Location
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
