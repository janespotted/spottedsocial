import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Plus, Search, Trash2, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, parseISO, isAfter } from 'date-fns';

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
}

interface Event {
  id: string;
  venue_id: string | null;
  venue_name: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string | null;
  city: string | null;
  neighborhood: string | null;
}

interface EventsPanelProps {
  selectedCity: 'nyc' | 'la' | 'pb';
}

export function EventsPanel({ selectedCity }: EventsPanelProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [venueSearch, setVenueSearch] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('21:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedCity]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsResult, venuesResult] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('city', selectedCity)
          .order('event_date', { ascending: true }),
        supabase
          .from('venues')
          .select('id, name, neighborhood, city')
          .eq('city', selectedCity)
          .order('name'),
      ]);

      setEvents(eventsResult.data || []);
      setVenues(venuesResult.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(venueSearch.toLowerCase())
  );

  const handleCreateEvent = async () => {
    if (!selectedVenue || !title.trim()) {
      toast.error('Please select a venue and enter a title');
      return;
    }

    setIsSubmitting(true);
    try {
      const expiresAt = new Date(eventDate);
      expiresAt.setDate(expiresAt.getDate() + 1);
      expiresAt.setHours(5, 0, 0, 0);

      const { error } = await supabase.from('events').insert({
        venue_id: selectedVenue.id,
        venue_name: selectedVenue.name,
        title: title.trim(),
        description: description.trim() || null,
        event_date: eventDate,
        start_time: startTime,
        city: selectedCity,
        neighborhood: selectedVenue.neighborhood,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      toast.success('Event created!');
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Error creating event:', err);
      toast.error('Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      // First delete any RSVPs
      await supabase.from('event_rsvps').delete().eq('event_id', eventId);
      
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;

      toast.success('Event deleted');
      fetchData();
    } catch (err) {
      console.error('Error deleting event:', err);
      toast.error('Failed to delete event');
    }
  };

  const resetForm = () => {
    setSelectedVenue(null);
    setVenueSearch('');
    setTitle('');
    setDescription('');
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('21:00');
    setShowForm(false);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  const isUpcoming = (dateStr: string) => {
    return isAfter(parseISO(dateStr), new Date());
  };

  const dateOptions = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(new Date(), i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'EEE, MMM d'),
    };
  });

  const upcomingEvents = events.filter(e => isUpcoming(e.event_date));
  const pastEvents = events.filter(e => !isUpcoming(e.event_date));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium">
          Events in {selectedCity.toUpperCase()}
        </h3>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary/80 gap-1"
        >
          <Plus className="h-4 w-4" />
          Add Event
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Create Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Venue Selection */}
            {selectedVenue ? (
              <div 
                className="flex items-center gap-2 p-2 rounded-lg bg-primary/20 cursor-pointer"
                onClick={() => setSelectedVenue(null)}
              >
                <MapPin className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-primary text-sm font-medium">{selectedVenue.name}</p>
                  <p className="text-white/50 text-xs">{selectedVenue.neighborhood}</p>
                </div>
                <span className="text-white/40 text-xs">Change</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    placeholder="Search venue..."
                    value={venueSearch}
                    onChange={(e) => setVenueSearch(e.target.value)}
                    className="pl-9 bg-white/5 border-white/20 text-white text-sm"
                  />
                </div>
                <ScrollArea className="h-32">
                  {filteredVenues.slice(0, 10).map(venue => (
                    <div
                      key={venue.id}
                      className="p-2 hover:bg-white/10 rounded cursor-pointer"
                      onClick={() => {
                        setSelectedVenue(venue);
                        setVenueSearch('');
                      }}
                    >
                      <p className="text-white text-sm">{venue.name}</p>
                      <p className="text-white/50 text-xs">{venue.neighborhood}</p>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}

            {selectedVenue && (
              <>
                {/* Title */}
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Title *</Label>
                  <Input
                    placeholder="Friday Night DJ Set"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-white/5 border-white/20 text-white text-sm"
                  />
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Date</Label>
                    <select
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full h-9 px-2 rounded-md bg-white/5 border border-white/20 text-white text-sm"
                    >
                      {dateOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Time</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="bg-white/5 border-white/20 text-white text-sm h-9"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Description (optional)</Label>
                  <Textarea
                    placeholder="House music all night..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-white/5 border-white/20 text-white text-sm min-h-[60px]"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                    className="text-white/50 hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateEvent}
                    disabled={isSubmitting || !title.trim()}
                    className="bg-primary hover:bg-primary/80 flex-1"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Event'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Events List */}
      {loading ? (
        <div className="text-white/50 text-center py-8">Loading events...</div>
      ) : events.length === 0 ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-8 text-center">
            <Calendar className="h-8 w-8 text-white/20 mx-auto mb-2" />
            <p className="text-white/50 text-sm">No events yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {upcomingEvents.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-white/60 text-xs uppercase tracking-wide">Upcoming</h4>
              {upcomingEvents.map(event => (
                <Card key={event.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-white font-medium text-sm truncate">{event.title}</h5>
                        <p className="text-white/50 text-xs">{event.venue_name}</p>
                        <div className="flex items-center gap-2 mt-1 text-white/40 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(event.event_date), 'EEE, MMM d')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(event.start_time)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteEvent(event.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {pastEvents.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-white/40 text-xs uppercase tracking-wide">Past</h4>
              {pastEvents.slice(0, 5).map(event => (
                <Card key={event.id} className="bg-white/5 border-white/10 opacity-50">
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/70 text-xs">{event.title}</p>
                        <p className="text-white/30 text-[10px]">{event.venue_name}</p>
                      </div>
                      <Badge variant="secondary" className="bg-white/10 text-white/40 text-[10px]">
                        {format(parseISO(event.event_date), 'MMM d')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
