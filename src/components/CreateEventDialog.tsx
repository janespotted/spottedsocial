import { useState, useEffect } from 'react';
import { MapPin, Search, Calendar, Clock, FileText, Link, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useUserCity } from '@/hooks/useUserCity';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventCreated: () => void;
}

export function CreateEventDialog({ open, onOpenChange, onEventCreated }: CreateEventDialogProps) {
  const { user } = useAuth();
  const { city } = useUserCity();
  
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [venueSearch, setVenueSearch] = useState('');
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('21:00');
  const [ticketUrl, setTicketUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && city) {
      fetchVenues();
    }
  }, [open, city]);

  const fetchVenues = async () => {
    const { data } = await supabase
      .from('venues')
      .select('id, name, neighborhood, city')
      .eq('city', city)
      .order('popularity_rank');

    if (data) {
      setVenues(data);
    }
  };

  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
    v.neighborhood.toLowerCase().includes(venueSearch.toLowerCase())
  );

  const resetForm = () => {
    setSelectedVenue(null);
    setVenueSearch('');
    setTitle('');
    setDescription('');
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('21:00');
    setTicketUrl('');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to add events');
      return;
    }

    if (!selectedVenue) {
      toast.error('Please select a venue');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter an event title');
      return;
    }

    setIsSubmitting(true);

    try {
      const expiresAt = new Date(eventDate);
      expiresAt.setDate(expiresAt.getDate() + 1);
      expiresAt.setHours(5, 0, 0, 0);

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert({
          venue_id: selectedVenue.id,
          venue_name: selectedVenue.name,
          title: title.trim(),
          description: description.trim() || null,
          event_date: eventDate,
          start_time: startTime,
          ticket_url: ticketUrl.trim() || null,
          city: selectedVenue.city,
          neighborhood: selectedVenue.neighborhood,
          expires_at: expiresAt.toISOString(),
          created_by: user.id,
          is_demo: false,
        })
        .select('id')
        .single();

      if (eventError) throw eventError;

      if (eventData) {
        await supabase.from('event_rsvps').insert({
          event_id: eventData.id,
          user_id: user.id,
          rsvp_type: 'going',
        });
      }

      toast.success('Event added! Your friends can now see it 🎉');
      handleClose();
      onEventCreated();
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Failed to add event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(new Date(), i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'EEE, MMM d'),
    };
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] animate-fade-in">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 border-b border-border/20">
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Add an Event</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Venue Selection */}
          {selectedVenue ? (
            <div 
              className="flex items-center gap-3 py-3 cursor-pointer group"
              onClick={() => setSelectedVenue(null)}
            >
              <MapPin className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-primary">{selectedVenue.name}</p>
                <p className="text-xs text-muted-foreground">{selectedVenue.neighborhood}</p>
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-foreground">Change</span>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Where's the event?"
                  value={venueSearch}
                  onChange={(e) => setVenueSearch(e.target.value)}
                  className="pl-10 bg-background/30 border-border/30 h-11"
                  autoFocus
                />
              </div>
              <div className="mt-3 space-y-0.5 max-h-[60vh] overflow-y-auto">
                {filteredVenues.slice(0, 15).map(venue => (
                  <div
                    key={venue.id}
                    className="py-2.5 px-2 hover:bg-primary/10 cursor-pointer rounded-lg transition-colors"
                    onClick={() => {
                      setSelectedVenue(venue);
                      setVenueSearch('');
                    }}
                  >
                    <p className="font-medium text-foreground">{venue.name}</p>
                    <p className="text-xs text-muted-foreground">{venue.neighborhood}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Form - only show when venue selected */}
          {selectedVenue && (
            <div className="space-y-4 mt-4">
              {/* Title */}
              <div className="space-y-2">
                <Label className="text-foreground/70">Event Name *</Label>
                <Input
                  placeholder="Friday Night DJ Set"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-background/30 border-border/30"
                  maxLength={100}
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-foreground/70 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Date *
                  </Label>
                  <select
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-background/30 border border-border/30 text-foreground text-sm"
                  >
                    {dateOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground/70 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Time *
                  </Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-background/30 border-border/30"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-foreground/70 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Description (optional)
                </Label>
                <Textarea
                  placeholder="What's the vibe?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-background/30 border-border/30 min-h-[60px]"
                  maxLength={500}
                />
              </div>

              {/* Ticket URL */}
              <div className="space-y-2">
                <Label className="text-foreground/70 flex items-center gap-1">
                  <Link className="h-3 w-3" />
                  Ticket Link (optional)
                </Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={ticketUrl}
                  onChange={(e) => setTicketUrl(e.target.value)}
                  className="bg-background/30 border-border/30"
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                className="w-full bg-primary hover:bg-primary/80 h-12"
              >
                {isSubmitting ? 'Adding...' : 'Add Event'}
              </Button>

              <p className="text-center text-muted-foreground text-xs">
                You'll automatically be marked as "going" to this event
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
