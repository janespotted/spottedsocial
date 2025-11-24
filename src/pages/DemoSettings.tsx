import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Users, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getDemoMode, setDemoMode, seedDemoData, clearDemoData } from '@/lib/demo-data';

export default function DemoSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const mode = getDemoMode();
    setDemoEnabled(mode.enabled);
    setSeeded(mode.seeded);
  }, []);

  const handleToggleDemo = async (enabled: boolean) => {
    setDemoMode(enabled);
    setDemoEnabled(enabled);
    
    if (enabled && !seeded) {
      toast.info('Demo mode enabled. Tap "Seed Demo Data" to populate.');
    } else if (!enabled) {
      toast.success('Demo mode disabled. Demo data will be hidden.');
    }
  };

  const handleSeedData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const result = await seedDemoData(user.id);
      if (result.success) {
        setSeeded(true);
        toast.success(`Demo data seeded! ${result.count} demo users created.`);
        setTimeout(() => navigate('/'), 1000);
      } else {
        toast.error('Failed to seed demo data');
      }
    } catch (error) {
      toast.error('Error seeding demo data');
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    setLoading(true);
    try {
      const result = await clearDemoData();
      if (result.success) {
        setSeeded(false);
        toast.success('Demo data cleared!');
        setTimeout(() => navigate('/'), 1000);
      } else {
        toast.error('Failed to clear demo data');
      }
    } catch (error) {
      toast.error('Error clearing demo data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a0f2e] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center gap-4 p-6">
          <button
            onClick={() => navigate(-1)}
            className="text-white hover:text-[#d4ff00] transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-light tracking-[0.3em] text-white">Demo</h1>
            <h2 className="text-3xl font-bold text-white">Settings</h2>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Demo Mode Toggle */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-[#d4ff00] flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Demo Mode
            </CardTitle>
            <CardDescription className="text-white/60">
              Enable demo mode to see fake users and activity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="demo-mode" className="text-white">
                Show demo data
              </Label>
              <Switch
                id="demo-mode"
                checked={demoEnabled}
                onCheckedChange={handleToggleDemo}
              />
            </div>
            
            {demoEnabled && (
              <div className="pt-4 border-t border-[#a855f7]/20 space-y-3">
                <p className="text-sm text-white/70">
                  Demo mode is {seeded ? 'active' : 'enabled but not seeded'}
                </p>
                
                {!seeded ? (
                  <Button
                    onClick={handleSeedData}
                    disabled={loading}
                    className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {loading ? 'Seeding...' : 'Seed Demo Data'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleClearData}
                    disabled={loading}
                    variant="outline"
                    className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {loading ? 'Clearing...' : 'Clear Demo Data'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-white">What is Demo Mode?</CardTitle>
          </CardHeader>
          <CardContent className="text-white/70 space-y-2 text-sm">
            <p>
              Demo mode creates fake users, posts, and activity to help you see how the app looks with real data.
            </p>
            <p>
              All demo data is marked with <code className="text-[#d4ff00]">isDemo = true</code> so you can:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Filter it out when needed</li>
              <li>Clear it anytime without affecting real data</li>
              <li>Use it for testing and demos</li>
            </ul>
            <p className="pt-2 text-white/50">
              Demo users will appear as your friends, post content, and check in to venues.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
