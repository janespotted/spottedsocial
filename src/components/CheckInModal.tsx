import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Ghost } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckInModal({ open, onOpenChange }: CheckInModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<'out' | 'heading_out' | 'home'>('home');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareOption, setShareOption] = useState<'close_friends' | 'friends' | 'mutual_friends'>('close_friends');

  const calculateExpiryTime = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return tomorrow.toISOString();
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Spotted App',
          },
        }
      );
      const data = await response.json();
      
      const address = data.address;
      const locationName = 
        address?.amenity || 
        address?.building || 
        address?.shop || 
        address?.restaurant || 
        address?.bar || 
        address?.road || 
        address?.neighbourhood || 
        address?.suburb || 
        address?.city ||
        'Current Location';
      
      return locationName;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return 'Current Location';
    }
  };

  const handleStatusUpdate = async (status: 'out' | 'heading_out' | 'home') => {
    setSelectedStatus(status);

    if (status === 'out') {
      setShowShareModal(true);
    } else if (status === 'heading_out') {
      setIsDetectingLocation(true);
      
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const venueName = await reverseGeocode(lat, lng);
            await updateStatus(status, lat, lng, venueName);
            setIsDetectingLocation(false);
            onOpenChange(false);
          },
          (error) => {
            setIsDetectingLocation(false);
            toast({
              variant: 'destructive',
              title: 'Location access denied',
              description: 'Please enable location services to use this feature.',
            });
          }
        );
      }
    } else {
      await updateStatus(status, null, null, null);
      onOpenChange(false);
    }
  };

  const handleShareLocation = async () => {
    setShowShareModal(false);
    setIsDetectingLocation(true);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const venueName = await reverseGeocode(lat, lng);
          await updateStatus('out', lat, lng, venueName);
          setIsDetectingLocation(false);
          onOpenChange(false);
        },
        (error) => {
          setIsDetectingLocation(false);
          toast({
            variant: 'destructive',
            title: 'Location access denied',
            description: 'Please enable location services to use this feature.',
          });
        }
      );
    }
  };

  const updateStatus = async (
    status: 'out' | 'heading_out' | 'home',
    lat: number | null,
    lng: number | null,
    venue: string | null
  ) => {
    try {
      const statusData = {
        user_id: user?.id,
        status,
        lat,
        lng,
        venue_name: venue,
        updated_at: new Date().toISOString(),
        expires_at: status === 'home' ? null : calculateExpiryTime(),
      };

      const { error } = await supabase
        .from('night_statuses')
        .upsert(statusData, { onConflict: 'user_id' });

      if (error) throw error;

      if (status !== 'home' && lat && lng && venue) {
        await supabase.from('checkins').insert({
          user_id: user?.id,
          venue_name: venue,
          lat,
          lng,
        });
      }

      toast({
        title: 'Status updated!',
        description: status === 'home' ? "You're staying in." : status === 'out' ? `You're out at ${venue}!` : `You're still deciding - heading to ${venue}!`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  return (
    <>
      <Dialog open={open && !showShareModal} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gradient-to-b from-[#3d2b5f] via-[#2a1f4a] to-black border-0 shadow-[0_0_60px_rgba(147,51,234,0.8)] max-w-md mx-4 p-0 overflow-hidden min-h-[600px]">
          <div className="flex flex-col items-center justify-between p-6 min-h-[600px]">
            {/* Header */}
            <div className="w-full flex items-start justify-between pt-4">
              <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
              <div className="text-3xl font-bold text-[#d4ff00]">S</div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center space-y-12 w-full">
              <h2 className="text-5xl font-bold text-[#d4ff00] text-center leading-tight">
                Are You<br />Out?
              </h2>

              <div className="w-full space-y-4">
                <Button
                  onClick={() => handleStatusUpdate('out')}
                  variant="outline"
                  size="lg"
                  className="w-full h-16 text-xl font-semibold rounded-full border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.3)] disabled:opacity-50"
                  disabled={isDetectingLocation}
                >
                  {isDetectingLocation && selectedStatus === 'out' ? 'Detecting location...' : 'Yes'}
                </Button>
                <Button
                  onClick={() => handleStatusUpdate('home')}
                  variant="outline"
                  size="lg"
                  className="w-full h-16 text-xl font-semibold rounded-full border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.3)] disabled:opacity-50"
                  disabled={isDetectingLocation}
                >
                  No
                </Button>
                <Button
                  onClick={() => handleStatusUpdate('heading_out')}
                  variant="outline"
                  size="lg"
                  className="w-full h-16 text-xl font-semibold rounded-full border-2 border-white bg-transparent text-white hover:bg-white/10 hover:text-white shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50"
                  disabled={isDetectingLocation}
                >
                  {isDetectingLocation && selectedStatus === 'heading_out' ? 'Detecting location...' : 'Still Deciding...'}
                </Button>
              </div>
            </div>

            {/* Ghost Icon */}
            <div className="w-full flex justify-end">
              <Ghost className="h-8 w-8 text-white/60" />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Location Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm mx-4 p-0 overflow-hidden">
          <div className="relative p-6 space-y-6">
            <div className="absolute top-4 right-4 text-2xl font-bold text-[#d4ff00]">S</div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-white">Share Your Location With:</h3>
              <div className="h-px bg-white/20" />
            </div>

            <div className="space-y-4">
              <button
                onClick={() => setShareOption('close_friends')}
                className="w-full flex items-center gap-4 text-left"
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  shareOption === 'close_friends' ? 'border-[#d4ff00]' : 'border-white/40'
                }`}>
                  {shareOption === 'close_friends' && (
                    <div className="w-4 h-4 rounded-full bg-[#d4ff00]" />
                  )}
                </div>
                <span className="text-lg text-white">Close Friends 💛</span>
              </button>

              <button
                onClick={() => setShareOption('friends')}
                className="w-full flex items-center gap-4 text-left"
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  shareOption === 'friends' ? 'border-[#d4ff00]' : 'border-white/40'
                }`}>
                  {shareOption === 'friends' && (
                    <div className="w-4 h-4 rounded-full bg-[#d4ff00]" />
                  )}
                </div>
                <span className="text-lg text-white">Friends 👫</span>
              </button>

              <button
                onClick={() => setShareOption('mutual_friends')}
                className="w-full flex items-center gap-4 text-left"
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  shareOption === 'mutual_friends' ? 'border-[#d4ff00]' : 'border-white/40'
                }`}>
                  {shareOption === 'mutual_friends' && (
                    <div className="w-4 h-4 rounded-full bg-[#d4ff00]" />
                  )}
                </div>
                <span className="text-lg text-white">Mutual Friends 🔗</span>
              </button>
            </div>

            <Button
              onClick={handleShareLocation}
              className="w-full h-14 text-lg font-semibold rounded-full bg-[#5b21b6] text-[#d4ff00] border-2 border-[#d4ff00] hover:bg-[#6d28d9] shadow-[0_0_20px_rgba(212,255,0,0.4)]"
            >
              Share Location
            </Button>

            <p className="text-center text-sm text-white/60 italic">
              Location stops sharing at 5am
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
