import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BusinessLayout } from '@/components/business/BusinessLayout';
import { VenueSelector } from '@/components/business/VenueSelector';
import { CreateBusinessEventDialog } from '@/components/business/CreateBusinessEventDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, Clock, Users, Trash2, Edit2 } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { toast } from 'sonner';

interface Event {
  id: string;
  venue_id: string | null;
  venue_name: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string | null;
  cover_image_url: string | null;
  ticket_url: string | null;
  city: string | null;
  neighborhood: string | null;
  expires_at: string;
}

export default function BusinessEvents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  useEffect(() => {
    if (selectedVenueId) {
      fetchEvents();
    } else {
      setEvents([]);
      setLoading(false);
    }
  }, [selectedVenueId]);

  const fetchEvents = async () => {
    if (!selectedVenueId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('venue_id', selectedVenueId)
        .order('event_date', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Error fetching events:', err);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      
      toast.success('Event deleted');
      fetchEvents();
    } catch (err) {
      console.error('Error deleting event:', err);
      toast.error('Failed to delete event');
    }
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

  const upcomingEvents = events.filter(e => isUpcoming(e.event_date));
  const pastEvents = events.filter(e => !isUpcoming(e.event_date));

  return (
    <BusinessLayout title="Events" showBack>
      <div className="mb-4">
        <VenueSelector
          selectedVenueId={selectedVenueId}
          onVenueChange={(id, name) => {
            setSelectedVenueId(id);
            setSelectedVenueName(name ?? null);
          }}
        />
      </div>

      {selectedVenueId ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">
              {selectedVenueName}'s Events
            </h2>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-primary hover:bg-primary/80 gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Event
            </Button>
          </div>

          {loading ? (
            <div className="text-white/50 text-center py-8">Loading events...</div>
          ) : upcomingEvents.length === 0 && pastEvents.length === 0 ? (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/60 mb-2">No events yet</p>
                <p className="text-white/40 text-sm mb-4">
                  Add your first event to let people know what's happening
                </p>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-primary hover:bg-primary/80"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Event
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {upcomingEvents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-white/60 text-xs uppercase tracking-wide">Upcoming</h3>
                  {upcomingEvents.map(event => (
                    <Card key={event.id} className="bg-white/5 border-white/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium truncate">{event.title}</h4>
                            {event.description && (
                              <p className="text-white/50 text-sm line-clamp-2 mt-1">
                                {event.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-white/40 text-xs">
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
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingEvent(event)}
                              className="text-white/50 hover:text-white hover:bg-white/10 h-8 w-8"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteEvent(event.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {pastEvents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-white/40 text-xs uppercase tracking-wide">Past</h3>
                  {pastEvents.slice(0, 5).map(event => (
                    <Card key={event.id} className="bg-white/5 border-white/10 opacity-50">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-white/70 text-sm">{event.title}</h4>
                            <p className="text-white/30 text-xs">
                              {format(parseISO(event.event_date), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Badge variant="secondary" className="bg-white/10 text-white/50 text-xs">
                            Past
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2">Select a venue to manage events</p>
          </CardContent>
        </Card>
      )}

      <CreateBusinessEventDialog
        open={showCreateDialog || !!editingEvent}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingEvent(null);
          }
        }}
        venueId={selectedVenueId}
        venueName={selectedVenueName}
        event={editingEvent}
        onEventCreated={() => {
          setShowCreateDialog(false);
          setEditingEvent(null);
          fetchEvents();
        }}
      />
    </BusinessLayout>
  );
}
