import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Search, Plus, X, MapPin, Star, FileText, BarChart3 } from 'lucide-react';
 import { Building2 } from 'lucide-react';
import { VenueReportsPanel } from '@/components/admin/VenueReportsPanel';
import { DetectionAnalyticsPanel } from '@/components/admin/DetectionAnalyticsPanel';
 import { ClaimRequestsPanel } from '@/components/admin/ClaimRequestsPanel';

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  type: string;
  is_leaderboard_promoted: boolean;
  is_map_promoted: boolean;
  popularity_rank: number | null;
  lat: number;
  lng: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState<'nyc' | 'la' | 'pb'>('nyc');
  const [leaderboardPromotedVenues, setLeaderboardPromotedVenues] = useState<Venue[]>([]);
  const [mapPromotedVenues, setMapPromotedVenues] = useState<Venue[]>([]);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardSearchQuery, setLeaderboardSearchQuery] = useState('');
  const [leaderboardSearchResults, setLeaderboardSearchResults] = useState<Venue[]>([]);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<Venue[]>([]);

  useEffect(() => {
    fetchVenues();
  }, [selectedCity]);

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('city', selectedCity)
        .order('name');

      if (error) throw error;

      const venues = data as Venue[];
      setAllVenues(venues);
      setLeaderboardPromotedVenues(venues.filter(v => v.is_leaderboard_promoted));
      setMapPromotedVenues(venues.filter(v => v.is_map_promoted));
    } catch (err) {
      console.error('Error fetching venues:', err);
      toast.error('Failed to load venues');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaderboardSearch = (query: string, searchState: string, setResults: (venues: Venue[]) => void) => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const results = allVenues.filter(v => 
      !v.is_leaderboard_promoted && 
      v.name.toLowerCase().includes(query.toLowerCase())
    );
    setResults(results.slice(0, 10));
  };

  const handleMapSearch = (query: string, setResults: (venues: Venue[]) => void) => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const results = allVenues.filter(v => 
      !v.is_map_promoted && 
      v.name.toLowerCase().includes(query.toLowerCase())
    );
    setResults(results.slice(0, 10));
  };

  const addToLeaderboardPromoted = async (venue: Venue) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ is_leaderboard_promoted: true })
        .eq('id', venue.id);

      if (error) throw error;

      toast.success(`${venue.name} added to leaderboard promoted`);
      fetchVenues();
    } catch (err) {
      console.error('Error promoting venue:', err);
      toast.error('Failed to add venue to leaderboard promoted');
    }
  };

  const removeFromLeaderboardPromoted = async (venue: Venue) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ is_leaderboard_promoted: false })
        .eq('id', venue.id);

      if (error) throw error;

      toast.success(`${venue.name} removed from leaderboard promoted`);
      fetchVenues();
    } catch (err) {
      console.error('Error removing promoted venue:', err);
      toast.error('Failed to remove venue from leaderboard promoted');
    }
  };

  const addToMapPromoted = async (venue: Venue) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ is_map_promoted: true })
        .eq('id', venue.id);

      if (error) throw error;

      toast.success(`${venue.name} added to map promoted`);
      fetchVenues();
    } catch (err) {
      console.error('Error promoting venue:', err);
      toast.error('Failed to add venue to map promoted');
    }
  };

  const removeFromMapPromoted = async (venue: Venue) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ is_map_promoted: false })
        .eq('id', venue.id);

      if (error) throw error;

      toast.success(`${venue.name} removed from map promoted`);
      fetchVenues();
    } catch (err) {
      console.error('Error removing promoted venue:', err);
      toast.error('Failed to remove venue from map promoted');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
      <div className="max-w-[430px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-white">Admin Panel</h1>
          </div>
        </div>

        <Tabs defaultValue="promoted" className="w-full">
           <TabsList className="w-full bg-white/5 border border-white/10 grid grid-cols-5">
            <TabsTrigger value="promoted" className="data-[state=active]:bg-primary text-xs">
              <Star className="h-3 w-3 mr-1" />
              Promoted
            </TabsTrigger>
            <TabsTrigger value="all" className="data-[state=active]:bg-primary text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              Venues
            </TabsTrigger>
             <TabsTrigger value="claims" className="data-[state=active]:bg-primary text-xs">
               <Building2 className="h-3 w-3 mr-1" />
               Claims
             </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-primary text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-primary text-xs">
              <BarChart3 className="h-3 w-3 mr-1" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="promoted" className="mt-4 space-y-4">
            {/* City Selector */}
            <div className="flex gap-2">
              <Button
                variant={selectedCity === 'nyc' ? 'default' : 'outline'}
                onClick={() => setSelectedCity('nyc')}
                className={selectedCity === 'nyc' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
              >
                NYC
              </Button>
              <Button
                variant={selectedCity === 'la' ? 'default' : 'outline'}
                onClick={() => setSelectedCity('la')}
                className={selectedCity === 'la' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
              >
                LA
              </Button>
              <Button
                variant={selectedCity === 'pb' ? 'default' : 'outline'}
                onClick={() => setSelectedCity('pb')}
                className={selectedCity === 'pb' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
              >
                PB
              </Button>
            </div>

            {/* Leaderboard Promotions Section */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  Leaderboard Promoted ({leaderboardPromotedVenues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="text-white/50 text-sm">Loading...</div>
                ) : leaderboardPromotedVenues.length === 0 ? (
                  <div className="text-white/50 text-sm">No leaderboard promoted venues in {selectedCity.toUpperCase()}</div>
                ) : (
                  leaderboardPromotedVenues.map(venue => (
                    <div
                      key={venue.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                    >
                      <div>
                        <div className="text-white font-medium">{venue.name}</div>
                        <div className="text-white/50 text-xs flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {venue.neighborhood}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFromLeaderboardPromoted(venue)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                {/* Add to Leaderboard Promoted Search */}
                <div className="pt-3 border-t border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      placeholder="Search to add..."
                      value={leaderboardSearchQuery}
                      onChange={(e) => {
                        setLeaderboardSearchQuery(e.target.value);
                        handleLeaderboardSearch(e.target.value, leaderboardSearchQuery, setLeaderboardSearchResults);
                      }}
                      className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40"
                    />
                  </div>
                  {leaderboardSearchResults.length > 0 && (
                    <div className="space-y-2 mt-2 max-h-[200px] overflow-y-auto">
                      {leaderboardSearchResults.map(venue => (
                        <div
                          key={venue.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5"
                        >
                          <div className="text-white text-sm">{venue.name}</div>
                          <Button
                            size="sm"
                            onClick={() => {
                              addToLeaderboardPromoted(venue);
                              setLeaderboardSearchQuery('');
                              setLeaderboardSearchResults([]);
                            }}
                            className="bg-primary hover:bg-primary/80 h-7 text-xs"
                          >
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Map Promotions Section */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Map Promoted ({mapPromotedVenues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="text-white/50 text-sm">Loading...</div>
                ) : mapPromotedVenues.length === 0 ? (
                  <div className="text-white/50 text-sm">No map promoted venues in {selectedCity.toUpperCase()}</div>
                ) : (
                  mapPromotedVenues.map(venue => (
                    <div
                      key={venue.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                    >
                      <div>
                        <div className="text-white font-medium">{venue.name}</div>
                        <div className="text-white/50 text-xs flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {venue.neighborhood}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFromMapPromoted(venue)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                {/* Add to Map Promoted Search */}
                <div className="pt-3 border-t border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      placeholder="Search to add..."
                      value={mapSearchQuery}
                      onChange={(e) => {
                        setMapSearchQuery(e.target.value);
                        handleMapSearch(e.target.value, setMapSearchResults);
                      }}
                      className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40"
                    />
                  </div>
                  {mapSearchResults.length > 0 && (
                    <div className="space-y-2 mt-2 max-h-[200px] overflow-y-auto">
                      {mapSearchResults.map(venue => (
                        <div
                          key={venue.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5"
                        >
                          <div className="text-white text-sm">{venue.name}</div>
                          <Button
                            size="sm"
                            onClick={() => {
                              addToMapPromoted(venue);
                              setMapSearchQuery('');
                              setMapSearchResults([]);
                            }}
                            className="bg-primary hover:bg-primary/80 h-7 text-xs"
                          >
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="mt-4 space-y-4">
            {/* City Selector */}
            <div className="flex gap-2">
              <Button
                variant={selectedCity === 'nyc' ? 'default' : 'outline'}
                onClick={() => setSelectedCity('nyc')}
                className={selectedCity === 'nyc' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
              >
                NYC
              </Button>
              <Button
                variant={selectedCity === 'la' ? 'default' : 'outline'}
                onClick={() => setSelectedCity('la')}
                className={selectedCity === 'la' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
              >
                LA
              </Button>
              <Button
                variant={selectedCity === 'pb' ? 'default' : 'outline'}
                onClick={() => setSelectedCity('pb')}
                className={selectedCity === 'pb' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
              >
                PB
              </Button>
            </div>

            {/* All Venues List */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm">
                  All Venues ({allVenues.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {loading ? (
                    <div className="text-white/50 text-sm">Loading...</div>
                  ) : (
                    allVenues.map(venue => (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium flex items-center gap-2">
                            {venue.name}
                            {venue.is_leaderboard_promoted && (
                              <Star className="h-3 w-3 text-primary fill-primary" />
                            )}
                            {venue.is_map_promoted && (
                              <MapPin className="h-3 w-3 text-primary fill-primary" />
                            )}
                          </div>
                          <div className="text-white/50 text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {venue.neighborhood}
                            <span className="mx-1">•</span>
                            <span className="capitalize">{venue.type.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={venue.is_leaderboard_promoted ? 'destructive' : 'outline'}
                            onClick={() => venue.is_leaderboard_promoted ? removeFromLeaderboardPromoted(venue) : addToLeaderboardPromoted(venue)}
                            className={!venue.is_leaderboard_promoted ? 'border-white/20 text-white hover:bg-white/10 text-xs h-7' : 'text-xs h-7'}
                          >
                            {venue.is_leaderboard_promoted ? '−LB' : '+LB'}
                          </Button>
                          <Button
                            size="sm"
                            variant={venue.is_map_promoted ? 'destructive' : 'outline'}
                            onClick={() => venue.is_map_promoted ? removeFromMapPromoted(venue) : addToMapPromoted(venue)}
                            className={!venue.is_map_promoted ? 'border-white/20 text-white hover:bg-white/10 text-xs h-7' : 'text-xs h-7'}
                          >
                            {venue.is_map_promoted ? '−Map' : '+Map'}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

           {/* Claims Tab */}
           <TabsContent value="claims" className="mt-4 space-y-4">
             <ClaimRequestsPanel />
           </TabsContent>
 
          {/* Reports Tab */}
          <TabsContent value="reports" className="mt-4 space-y-4">
            <VenueReportsPanel />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            <DetectionAnalyticsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
