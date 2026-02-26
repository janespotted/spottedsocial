import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
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

  const getExpiryTime = () => {
    const now = new Date();
    const expiry = new Date(now);
    if (now.getHours() < 5) {
      expiry.setHours(5, 0, 0, 0);
    } else {
      expiry.setDate(expiry.getDate() + 1);
      expiry.setHours(5, 0, 0, 0);
    }
    return expiry.toISOString();
  };

  const handleGoLive = async () => {
    if (!user) return;
    
    if (suggestedVenue) {
      setLoading(true);
      haptic.medium();
      
      try {
        const now = new Date().toISOString();
        
        await supabase
          .from('checkins')
          .update({ ended_at: now })
          .eq('user_id', user.id)
          .is('ended_at', null);

        await supabase
          .from('checkins')
          .insert({
            user_id: user.id,
            venue_id: suggestedVenue.id,
            venue_name: suggestedVenue.name,
            lat: suggestedVenue.lat,
            lng: suggestedVenue.lng,
            started_at: now,
          });

        await supabase
          .from('night_statuses')
          .upsert({
            user_id: user.id,
            status: 'out',
            venue_id: suggestedVenue.id,
            venue_name: suggestedVenue.name,
            lat: suggestedVenue.lat,
            lng: suggestedVenue.lng,
            updated_at: now,
            expires_at: getExpiryTime(),
            is_private_party: false,
            planning_neighborhood: null,
          }, { onConflict: 'user_id' });

        await supabase
          .from('profiles')
          .update({
            is_out: true,
            last_known_lat: suggestedVenue.lat,
            last_known_lng: suggestedVenue.lng,
            last_location_at: now,
          })
          .eq('id', user.id);

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
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'planning',
          venue_id: null,
          venue_name: null,
          lat: null,
          lng: null,
          updated_at: new Date().toISOString(),
          expires_at: getExpiryTime(),
          is_private_party: false,
        }, { onConflict: 'user_id' });

      await supabase
        .from('profiles')
        .update({ is_out: false })
        .eq('id', user.id);

      toast.success('Planning on it! 🎯');
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
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'off',
          venue_id: null,
          venue_name: null,
          lat: null,
          lng: null,
          updated_at: new Date().toISOString(),
          expires_at: getExpiryTime(),
          is_private_party: false,
          planning_neighborhood: null,
        }, { onConflict: 'user_id' });

      await supabase
        .from('checkins')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('ended_at', null);

      await supabase
        .from('profiles')
        .update({
          is_out: false,
          last_known_lat: null,
          last_known_lng: null,
          last_location_at: null,
        })
        .eq('id', user.id);

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
      const now = new Date().toISOString();

      // Clear night status location but keep status as 'home'
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'off',
          venue_id: null,
          venue_name: null,
          lat: null,
          lng: null,
          updated_at: now,
          expires_at: getExpiryTime(),
          is_private_party: false,
          planning_neighborhood: null,
        }, { onConflict: 'user_id' });

      // End active check-ins
      await supabase
        .from('checkins')
        .update({ ended_at: now })
        .eq('user_id', user.id)
        .is('ended_at', null);

      // Clear location from profile
      await supabase
        .from('profiles')
        .update({
          is_out: false,
          last_known_lat: null,
          last_known_lng: null,
          last_location_at: null,
        })
        .eq('id', user.id);

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
                 currentStatus === 'planning' ? 'Planning on it' :
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
            Planning on it
          </Button>

          <Button
            onClick={handleStayingIn}
            disabled={loading}
            variant="ghost"
            className="w-full h-12 text-base text-white/60 hover:text-white hover:bg-white/5 rounded-2xl"
          >
            <Home className="w-4 h-4 mr-2" />
            No — staying in
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
