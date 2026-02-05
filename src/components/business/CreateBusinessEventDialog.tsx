import { useState, useEffect } from 'react';
import { Calendar, Clock, Link, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

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

interface CreateBusinessEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string | null;
  venueName: string | null;
  event?: Event | null;
  onEventCreated: () => void;
}

export function CreateBusinessEventDialog({
  open,
  onOpenChange,
  venueId,
  venueName,
  event,
  onEventCreated,
}: CreateBusinessEventDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('21:00');
  const [endTime, setEndTime] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!event;

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setEventDate(event.event_date);
      setStartTime(event.start_time);
      setEndTime(event.end_time || '');
      setTicketUrl(event.ticket_url || '');
    } else {
      resetForm();
    }
  }, [event, open]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('21:00');
    setEndTime('');
    setTicketUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!venueId || !venueName) {
      toast.error('Please select a venue first');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter an event title');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get venue details for city/neighborhood
      const { data: venue } = await supabase
        .from('venues')
        .select('city, neighborhood')
        .eq('id', venueId)
        .single();

      // Expire at 5am the day after the event
      const expiresAt = new Date(eventDate);
      expiresAt.setDate(expiresAt.getDate() + 1);
      expiresAt.setHours(5, 0, 0, 0);

      const eventData = {
        venue_id: venueId,
        venue_name: venueName,
        title: title.trim(),
        description: description.trim() || null,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime || null,
        ticket_url: ticketUrl.trim() || null,
        city: venue?.city || null,
        neighborhood: venue?.neighborhood || null,
        expires_at: expiresAt.toISOString(),
      };

      if (isEditing && event) {
        const { error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', event.id);

        if (error) throw error;
        toast.success('Event updated!');
      } else {
        const { error } = await supabase
          .from('events')
          .insert(eventData);

        if (error) throw error;
        toast.success('Event created! 🎉');
      }

      resetForm();
      onEventCreated();
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error(isEditing ? 'Failed to update event' : 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dateOptions = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(new Date(), i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'EEE, MMM d'),
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEditing ? 'Edit Event' : 'Add Event'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-white/70">Event Title *</Label>
            <Input
              id="title"
              placeholder="Friday Night DJ Set"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              maxLength={100}
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-white/70 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date *
              </Label>
              <select
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-white/5 border border-white/20 text-white text-sm"
              >
                {dateOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Start Time *
              </Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label className="text-white/70">End Time (optional)</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="bg-white/5 border-white/20 text-white"
              placeholder="--:--"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-white/70 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Description (optional)
            </Label>
            <Textarea
              placeholder="House music all night with special guest DJ..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 min-h-[80px]"
              maxLength={500}
            />
          </div>

          {/* Ticket URL */}
          <div className="space-y-2">
            <Label className="text-white/70 flex items-center gap-1">
              <Link className="h-3 w-3" />
              Ticket URL (optional)
            </Label>
            <Input
              type="url"
              placeholder="https://..."
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="w-full bg-primary hover:bg-primary/80"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Event' : 'Create Event'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
