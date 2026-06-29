import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Users, Trash2, Sparkles, TrendingUp, MapPin, RefreshCw, Navigation, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { getDemoMode, setDemoMode, clearDemoData, seedDemoData, healthCheckDemoData } from '@/lib/demo-data';
import { getBootstrapMode, setBootstrapMode } from '@/lib/bootstrap-config';
import { useUserCity } from '@/hooks/useUserCity';
import { cacheCity, clearCachedCity, detectUserCity, type SupportedCity } from '@/lib/city-detection';

export default function DemoSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { city } = useUserCity();
  const cityLabel = city === 'la' ? 'LA' : 'NYC';
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  const [healthResult, setHealthResult] = useState<{ healthy?: boolean; stats?: Record<string, number>; isAdmin?: boolean; error?: string } | null>(null);

  useEffect(() => {
    const checkActualDemoData = async () => {
      // Check if demo data actually exists in database
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_demo', true)
        .limit(1);
      
      const actuallySeeded = profiles && profiles.length > 0;
      
      const mode = getDemoMode();
      setDemoEnabled(mode.enabled);
      
      // Check bootstrap mode
      const bootstrapMode = getBootstrapMode();
      setBootstrapEnabled(bootstrapMode.enabled);
      
      // Sync seeded state with actual database state
      if (mode.seeded !== actuallySeeded) {
        const correctedMode = { enabled: mode.enabled, seeded: actuallySeeded };
        localStorage.setItem('demo_mode', JSON.stringify(correctedMode));
        setSeeded(actuallySeeded);
      } else {
        setSeeded(mode.seeded);
      }
    };
    
    checkActualDemoData();
  }, []);

  // Fetch venues for the current city
  useEffect(() => {
    const fetchVenues = async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name, lat, lng')
        .eq('city', city)
        .order('popularity_rank', { ascending: true });
      
      if (data) {
        setVenues(data);
      }
    };
    
    fetchVenues();
  }, [city]);

  const handleToggleDemo = async (enabled: boolean) => {
    setDemoMode(enabled);
    setDemoEnabled(enabled);

    // Refetch friend IDs so demo friends are included/excluded immediately
    queryClient.refetchQueries({ queryKey: ['friend-ids'] });

    if (enabled && !seeded) {
      toast.info('Demo mode enabled. Tap "Seed Demo Data" to populate.');
    } else if (!enabled) {
      toast.success('Demo mode disabled. Demo data will be hidden.');
    }
  };

  const handleToggleBootstrap = (enabled: boolean) => {
    setBootstrapMode(enabled);
    setBootstrapEnabled(enabled);
    
    if (enabled) {
      toast.success(`Bootstrap mode enabled. Leaderboard will show curated ${cityLabel} venues.`);
    } else {
      toast.success('Bootstrap mode disabled. Only real user data will be shown.');
    }
  };

  const handleSeedData = async (targetCity?: SupportedCity) => {
    if (!user) return;

    const seedCity = targetCity || city;
    const seedCityLabel = seedCity === 'la' ? 'LA' : seedCity === 'pb' ? 'PB' : 'NYC';

    setLoading(true);
    try {
      toast.info(`Seeding ${seedCityLabel} demo data... This may take a moment.`);

      const result = await seedDemoData(user.id, seedCity);

      if (!result.success) {
        toast.error(`Seed failed (${result.status})`, {
          description: result.detail || 'Unknown error',
        });
        return;
      }

      // Seeding succeeded — now it's safe to mark as seeded and enable demo
      setSeeded(true);
      setDemoMode(true);
      setDemoEnabled(true);

      // Force clear + refetch ALL caches so components pick up new demo UUIDs
      queryClient.removeQueries({ queryKey: ['profiles-safe'] });
      queryClient.removeQueries({ queryKey: ['friend-ids'] });
      const { data: freshProfiles } = await supabase.rpc('get_profiles_safe');
      if (freshProfiles) queryClient.setQueryData(['profiles-safe'], freshProfiles);

      // Update city to match the seeded data so venue dropdown refreshes
      if (targetCity) {
        cacheCity(targetCity);
      }

      const s = result.stats;
      toast.success(
        `${seedCityLabel} demo environment created!\n` +
        `${s?.users ?? '?'} users • ${s?.posts ?? '?'} posts • ` +
        `${s?.yaps ?? '?'} yaps • ${s?.venues ?? '?'} venues`,
        { duration: 5000 }
      );
      setTimeout(() => navigate('/feed'), 1500);
    } catch (error: any) {
      toast.error('Error seeding demo data', { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setLoading(true);
    setHealthResult(null);
    try {
      const result = await healthCheckDemoData();
      if (!result.success) {
        toast.error(`Health check failed (${result.status})`, {
          description: result.error,
        });
        setHealthResult({ error: result.error });
      } else {
        setHealthResult({ healthy: result.healthy, stats: result.stats, isAdmin: result.isAdmin });
        toast.success(result.healthy ? 'Demo data is healthy' : 'Demo data is missing or incomplete');
      }
    } catch (error: any) {
      toast.error('Health check error', { description: error?.message });
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
        // Force refetch caches to remove stale demo data
        await queryClient.refetchQueries({ queryKey: ['profiles-safe'] });
        await queryClient.refetchQueries({ queryKey: ['friend-ids'] });
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

  const handleCitySelect = (selectedCity: SupportedCity) => {
    cacheCity(selectedCity);
    const label = selectedCity === 'la' ? 'LA' : 'NYC';
    toast.success(`City set to ${label}`);
  };

  const handleRedetectCity = async () => {
    setLoading(true);
    toast.info('Re-detecting your location...');
    try {
      clearCachedCity();
      
      // Force fresh GPS with high accuracy
      const position = await new Promise<{lat: number, lng: number}>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
      
      // Show the actual coordinates for debugging
      toast.info(`GPS: ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`);
      
      // Calculate distance to all cities
      const { calculateDistance, CITY_CENTERS } = await import('@/lib/city-detection');
      const nycDistance = calculateDistance(position, CITY_CENTERS.nyc);
      const laDistance = calculateDistance(position, CITY_CENTERS.la);
      
      // Determine closest city
      const detectedCity: SupportedCity = nycDistance < laDistance ? 'nyc' : 'la';
      cacheCity(detectedCity);
      
      const label = detectedCity === 'la' ? 'LA' : 'NYC';
      const distance = detectedCity === 'nyc' ? nycDistance : laDistance;
      toast.success(`Detected: ${label}! (${Math.round(distance)} miles away)`);
    } catch (error: any) {
      if (error?.code === 1) {
        toast.error('GPS permission denied. Please enable location access.');
      } else if (error?.code === 2) {
        toast.error('GPS unavailable on this device.');
      } else if (error?.code === 3) {
        toast.error('GPS timed out. Try again or select city manually.');
      } else {
        toast.error('Failed to detect location. Try selecting city manually.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateCheckin = async () => {
    if (!user || !selectedVenueId) {
      toast.error('Please select a venue first');
      return;
    }

    const venue = venues.find(v => v.id === selectedVenueId);
    if (!venue) return;

    setLoading(true);
    try {
      // Calculate expiry time (5 AM next morning)
      const now = new Date();
      const expiresAt = new Date(now);
      if (now.getHours() >= 5) {
        expiresAt.setDate(expiresAt.getDate() + 1);
      }
      expiresAt.setHours(5, 0, 0, 0);

      // Upsert night_status for the user
      const { error } = await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'out',
          venue_id: venue.id,
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast.success(`You're now "at" ${venue.name}! Open its Venue Card to test Yap.`, { duration: 5000 });
    } catch (error) {
      console.error('Error simulating check-in:', error);
      toast.error('Failed to simulate check-in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a0f2e]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="max-w-[430px] mx-auto flex items-center gap-4 p-6">
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

      <div className="max-w-[430px] mx-auto p-6 pb-24 space-y-6">
        {/* City Selection */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-[#d4ff00] flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              City Selection
            </CardTitle>
            <CardDescription className="text-white/60">
              Override GPS detection and manually switch cities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-white/70">
                Currently showing: <strong className="text-[#d4ff00]">{cityLabel}</strong>
              </p>
              
              <div className="flex gap-3">
                <Button
                  onClick={() => handleCitySelect('nyc')}
                  variant={city === 'nyc' ? 'default' : 'outline'}
                  className={city === 'nyc' 
                    ? 'flex-1 bg-[#a855f7] text-white hover:bg-[#a855f7]/90' 
                    : 'flex-1 border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10'
                  }
                >
                  NYC
                </Button>
                <Button
                  onClick={() => handleCitySelect('la')}
                  variant={city === 'la' ? 'default' : 'outline'}
                  className={city === 'la' 
                    ? 'flex-1 bg-[#a855f7] text-white hover:bg-[#a855f7]/90' 
                    : 'flex-1 border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10'
                  }
                >
                  LA
                </Button>
              </div>

              <Button
                onClick={handleRedetectCity}
                disabled={loading}
                variant="outline"
                className="w-full border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {loading ? 'Detecting...' : 'Re-detect via GPS'}
              </Button>
            </div>
          </CardContent>
        </Card>

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
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSeedData('nyc')}
                        disabled={loading}
                        className="flex-1 bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {loading ? '...' : 'NYC'}
                      </Button>
                      <Button
                        onClick={() => handleSeedData('la')}
                        disabled={loading}
                        className="flex-1 bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {loading ? '...' : 'LA'}
                      </Button>
                      <Button
                        onClick={() => handleSeedData('pb')}
                        disabled={loading}
                        className="flex-1 bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {loading ? '...' : 'PB'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSeedData('nyc')}
                        disabled={loading}
                        variant="outline"
                        className="flex-1 border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10"
                      >
                        NYC
                      </Button>
                      <Button
                        onClick={() => handleSeedData('la')}
                        disabled={loading}
                        variant="outline"
                        className="flex-1 border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10"
                      >
                        LA
                      </Button>
                      <Button
                        onClick={() => handleSeedData('pb')}
                        disabled={loading}
                        variant="outline"
                        className="flex-1 border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10"
                      >
                        PB
                      </Button>
                    </div>
                    <Button
                      onClick={handleClearData}
                      disabled={loading}
                      variant="outline"
                      className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {loading ? 'Clearing...' : 'Clear All Demo Data'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bootstrap Mode Toggle */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-[#d4ff00] flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Bootstrap Mode
            </CardTitle>
          <CardDescription className="text-white/60">
              For V1 launch: curated venue rankings, but only real user avatars appear
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="bootstrap-mode" className="text-white">
                Show promoted venues
              </Label>
              <Switch
                id="bootstrap-mode"
                checked={bootstrapEnabled}
                onCheckedChange={handleToggleBootstrap}
              />
            </div>
            
            {demoEnabled && bootstrapEnabled && (
              <p className="text-sm text-white/50 italic">
                Both modes ON: Demo content visible, but bootstrap venue rankings active
              </p>
            )}
            
            {bootstrapEnabled && (
              <div className="pt-4 border-t border-[#a855f7]/20">
                <p className="text-sm text-white/70">
                  <strong className="text-[#d4ff00]">Active:</strong> Leaderboard shows real data + 20 top-ranked {cityLabel} venues
                </p>
                <div className="mt-3 p-3 bg-[#1a0f2e]/60 rounded-lg border border-[#a855f7]/20 space-y-2 text-xs text-white/60">
                  <div className="flex justify-between">
                    <span>Promoted Venues:</span>
                    <span className="text-[#d4ff00]">20 {cityLabel} hotspots</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data Split:</span>
                    <span className="text-white/80">~75% promoted / 25% real</span>
                  </div>
                  <div className="text-white/50 pt-2">
                    Includes: {city === 'la' 
                      ? 'Sunset Room, Sound Nightclub, The Abbey, Death & Co LA, and more...'
                      : 'Superbueno, Ketchy Shuby, Gospël, The Box, Attaboy, Saint Tuesday, and more...'}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Simulate Check-in */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-[#d4ff00] flex items-center gap-2">
              <Navigation className="h-5 w-5" />
              Simulate Check-in
            </CardTitle>
            <CardDescription className="text-white/60">
              Pretend you're at a venue to test Yap feature
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-white">Select a venue:</Label>
              <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                <SelectTrigger className="w-full bg-[#1a0f2e]/60 border-[#a855f7]/40 text-white">
                  <SelectValue placeholder="Choose venue..." />
                </SelectTrigger>
                <SelectContent className="bg-[#2d1b4e] border-[#a855f7]/40">
                  {venues.map((venue) => (
                    <SelectItem 
                      key={venue.id} 
                      value={venue.id}
                      className="text-white hover:bg-[#a855f7]/20 focus:bg-[#a855f7]/20"
                    >
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                onClick={handleSimulateCheckin}
                disabled={loading || !selectedVenueId}
                className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
              >
                <Navigation className="h-4 w-4 mr-2" />
                {loading ? 'Checking in...' : 'Simulate Check-in'}
              </Button>
              
              <p className="text-xs text-white/50">
                After check-in, go to the Leaderboard → tap the venue → you'll see the Yap board
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Demo Health Check */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-[#d4ff00] flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Demo Health Check
            </CardTitle>
            <CardDescription className="text-white/60">
              Verify seed function connectivity and count is_demo rows in DB
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleHealthCheck}
              disabled={loading}
              variant="outline"
              className="w-full border-[#a855f7]/40 text-white/70 hover:bg-[#a855f7]/10"
            >
              <Activity className="h-4 w-4 mr-2" />
              {loading ? 'Checking...' : 'Run Health Check'}
            </Button>

            {healthResult?.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                {healthResult.error}
              </div>
            )}

            {healthResult?.stats && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${healthResult.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-sm text-white/80">
                    {healthResult.healthy ? 'Healthy — demo data present' : 'Unhealthy — demo data missing'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(healthResult.stats).map(([key, val]) => (
                    <div key={key} className="bg-[#1a0f2e]/60 p-2 rounded-lg border border-[#a855f7]/20 flex justify-between">
                      <span className="text-white/50 text-xs">{key}</span>
                      <span className="text-[#d4ff00] text-xs font-mono">{val}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/40">
                  Role: {healthResult.isAdmin ? 'admin' : 'non-admin (seed OK, clear requires admin)'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-[#2d1b4e]/60 border-2 border-[#a855f7]/40">
          <CardHeader>
            <CardTitle className="text-white">What Gets Created?</CardTitle>
          </CardHeader>
          <CardContent className="text-white/70 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1a0f2e]/60 p-3 rounded-lg border border-[#a855f7]/20">
                <div className="text-[#d4ff00] text-2xl font-bold">29</div>
                <div className="text-white/60 text-xs">Demo Users (24 + 5 TBD)</div>
              </div>
              <div className="bg-[#1a0f2e]/60 p-3 rounded-lg border border-[#a855f7]/20">
                <div className="text-[#d4ff00] text-2xl font-bold">5-8</div>
                <div className="text-white/60 text-xs">Demo Venues</div>
              </div>
              <div className="bg-[#1a0f2e]/60 p-3 rounded-lg border border-[#a855f7]/20">
                <div className="text-[#d4ff00] text-2xl font-bold">18</div>
                <div className="text-white/60 text-xs">Newsfeed Posts</div>
              </div>
              <div className="bg-[#1a0f2e]/60 p-3 rounded-lg border border-[#a855f7]/20">
                <div className="text-[#d4ff00] text-2xl font-bold">22+</div>
                <div className="text-white/60 text-xs">Yaps</div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <p>
                All demo data is marked with <code className="text-[#d4ff00]">is_demo = true</code> and expires in 30 days.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-white/60">
                <li>16 users "out" at venues, 8 users "planning"</li>
                <li>7 plans, 3 events, 4 DM threads</li>
                <li>Clear requires admin role</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
