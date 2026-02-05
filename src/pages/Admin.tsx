import { useState, useEffect } from 'react';
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
  is_promoted: boolean;
  popularity_rank: number | null;
  lat: number;
  lng: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState<'nyc' | 'la' | 'pb'>('nyc');
  const [promotedVenues, setPromotedVenues] = useState<Venue[]>([]);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

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
      setPromotedVenues(venues.filter(v => v.is_promoted));
    } catch (err) {
      console.error('Error fetching venues:', err);
      toast.error('Failed to load venues');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const results = allVenues.filter(v => 
      !v.is_promoted && 
      v.name.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results.slice(0, 10));
  };

  const addToPromoted = async (venue: Venue) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ is_promoted: true })
        .eq('id', venue.id);

      if (error) throw error;

      toast.success(`${venue.name} added to promoted venues`);
      fetchVenues();
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error promoting venue:', err);
      toast.error('Failed to add venue to promoted');
    }
  };

  const removeFromPromoted = async (venue: Venue) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ is_promoted: false })
        .eq('id', venue.id);

      if (error) throw error;

      toast.success(`${venue.name} removed from promoted venues`);
      fetchVenues();
    } catch (err) {
      console.error('Error removing promoted venue:', err);
      toast.error('Failed to remove venue from promoted');
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

            {/* Currently Promoted */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-400" />
                  Currently Promoted ({promotedVenues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="text-white/50 text-sm">Loading...</div>
                ) : promotedVenues.length === 0 ? (
                  <div className="text-white/50 text-sm">No promoted venues in {selectedCity.toUpperCase()}</div>
                ) : (
                  promotedVenues.map(venue => (
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
                        onClick={() => removeFromPromoted(venue)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Add to Promoted */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Venue to Promoted
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <Input
                    placeholder="Search venues..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {searchResults.map(venue => (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div>
                          <div className="text-white font-medium">{venue.name}</div>
                          <div className="text-white/50 text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {venue.neighborhood}
                            <Badge variant="outline" className="ml-2 text-[10px] border-white/20 text-white/60">
                              {venue.type}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => addToPromoted(venue)}
                          className="bg-primary hover:bg-primary/80"
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
                            {venue.is_promoted && (
                              <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                            )}
                          </div>
                          <div className="text-white/50 text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {venue.neighborhood}
                            <span className="mx-1">•</span>
                            <span className="capitalize">{venue.type.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={venue.is_promoted ? 'destructive' : 'outline'}
                          onClick={() => venue.is_promoted ? removeFromPromoted(venue) : addToPromoted(venue)}
                          className={!venue.is_promoted ? 'border-white/20 text-white hover:bg-white/10' : ''}
                        >
                          {venue.is_promoted ? 'Remove' : 'Promote'}
                        </Button>
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
