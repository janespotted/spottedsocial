import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Bell, Lock, HelpCircle, Info, Check, X, QrCode, UserPlus, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeModal } from '@/components/QRCodeModal';
import { useUserCity } from '@/hooks/useUserCity';
import { cacheCity, type SupportedCity } from '@/lib/city-detection';
import { APP_BASE_URL, openExternalUrl } from '@/lib/platform';
export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { city, refreshCity } = useUserCity();
  const { 
    isSupported, 
    permission, 
    isSubscribed, 
    isLoading, 
    subscribe, 
    unsubscribe 
  } = usePushNotifications();
  const [isToggling, setIsToggling] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const cityLabels: Record<SupportedCity, string> = {
    nyc: 'New York City',
    la: 'Los Angeles',
    pb: 'Palm Beach',
  };

  const handleCityChange = (newCity: SupportedCity) => {
    cacheCity(newCity);
    toast.success(`City changed to ${cityLabels[newCity]}`);
  };

  useEffect(() => {
    if (user) {
      fetchInviteCode();
    }
  }, [user]);

  const fetchInviteCode = async () => {
    const { data } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setInviteCode(data.code);
    }
  };

  const getInviteUrl = () => `${APP_BASE_URL}/invite/${inviteCode}`;

  const handlePushToggle = async (enabled: boolean) => {
    setIsToggling(true);
    try {
      if (enabled) {
        const success = await subscribe();
        if (success) {
          toast.success('Push notifications enabled! 🔔');
        } else if (permission === 'denied') {
          toast.error('Notifications blocked. Please enable in browser settings.');
        }
      } else {
        const success = await unsubscribe();
        if (success) {
          toast.success('Push notifications disabled');
        }
      }
    } finally {
      setIsToggling(false);
    }
  };

  const getPushStatus = () => {
    if (!isSupported) return { label: 'Not supported', color: 'text-white/40' };
    if (permission === 'denied') return { label: 'Blocked in browser', color: 'text-red-400' };
    if (isSubscribed) return { label: 'Enabled', color: 'text-green-400' };
    return { label: 'Disabled', color: 'text-white/60' };
  };

  const pushStatus = getPushStatus();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <div className="max-w-[430px] mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center gap-4 px-4 py-6">
          <button
            onClick={() => navigate('/profile')}
            className="text-white hover:text-[#d4ff00] transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-light tracking-[0.3em] text-white">Settings</h1>
        </div>
      </div>

      {/* Settings List */}
      <div className="px-4 py-6 space-y-3">
        {/* Account Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => navigate('/profile/edit')}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <User className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Account</h3>
                <p className="text-white/60 text-sm">Edit your profile information</p>
              </div>
            </div>
          </button>
        </Card>

        {/* Push Notifications Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <Bell className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Push Notifications</h3>
                <p className={`text-sm ${pushStatus.color}`}>
                  {pushStatus.label}
                </p>
              </div>
            </div>
            {isSupported && permission !== 'denied' && (
              <Switch
                checked={isSubscribed}
                onCheckedChange={handlePushToggle}
                disabled={isLoading || isToggling}
              />
            )}
            {permission === 'denied' && (
              <X className="h-5 w-5 text-red-400" />
            )}
            {!isSupported && (
              <span className="text-white/40 text-xs">Browser not supported</span>
            )}
          </div>
        </Card>

        {/* City Selector Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Your City</h3>
                <p className="text-white/60 text-sm">Where you're going out</p>
              </div>
            </div>
            <div className="flex gap-2">
              {(['nyc', 'la', 'pb'] as SupportedCity[]).map((c) => (
                <Button
                  key={c}
                  variant={city === c ? 'default' : 'outline'}
                  onClick={() => handleCityChange(c)}
                  className={
                    city === c
                      ? 'flex-1 bg-[#a855f7] hover:bg-[#9333ea]'
                      : 'flex-1 border-white/20 text-white hover:bg-white/10'
                  }
                >
                  {c.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Invite Friends Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => navigate('/friends')}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#d4ff00]/20 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-[#d4ff00]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Invite Friends</h3>
                <p className="text-white/60 text-sm">Share your invite link</p>
              </div>
            </div>
          </button>
        </Card>

        {/* QR Code Section */}
        {inviteCode && (
          <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
            <button
              onClick={() => setShowQRModal(true)}
              className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                  <QrCode className="h-5 w-5 text-[#a855f7]" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-white">My QR Code</h3>
                  <p className="text-white/60 text-sm">For adding friends in person</p>
                </div>
              </div>
            </button>
          </Card>
        )}

        {/* Activity Notifications Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => navigate('/messages', { state: { activeTab: 'activity' } })}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <Bell className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Activity</h3>
                <p className="text-white/60 text-sm">View your notification history</p>
              </div>
            </div>
          </button>
        </Card>

        {/* Privacy Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => navigate('/privacy')}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <Lock className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Privacy</h3>
                <p className="text-white/60 text-sm">Privacy policy and data usage</p>
              </div>
            </div>
          </button>
        </Card>

        {/* Help Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => openExternalUrl('mailto:support@spotted.app?subject=Help%20Request%20-%20Spotted%20App')}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Help & Support</h3>
                <p className="text-white/60 text-sm">Get help or contact support</p>
              </div>
            </div>
          </button>
        </Card>

        {/* About Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => navigate('/terms')}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <Info className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">About</h3>
                <p className="text-white/60 text-sm">Terms of service and app info</p>
              </div>
            </div>
          </button>
        </Card>

        <div className="text-center pt-6">
          <p className="text-white/40 text-sm">Spotted v1.0.0</p>
        </div>
      </div>

      {/* QR Code Modal */}
      {inviteCode && (
        <QRCodeModal
          open={showQRModal}
          onOpenChange={setShowQRModal}
          inviteUrl={getInviteUrl()}
        />
      )}
      </div>
    </div>
  );
}
