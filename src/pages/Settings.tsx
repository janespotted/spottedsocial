import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Bell, Lock, HelpCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
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

        {/* Notifications Section */}
        <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
          <button
            onClick={() => navigate('/notifications')}
            className="w-full flex items-center justify-between p-4 hover:bg-[#a855f7]/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
                <Bell className="h-5 w-5 text-[#a855f7]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white">Notifications</h3>
                <p className="text-white/60 text-sm">Manage notification preferences</p>
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

        {/* Version */}
        <div className="text-center pt-6">
          <p className="text-white/40 text-sm">Spotted v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
