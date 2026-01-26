import { useState, useEffect } from 'react';
import { MapPin, Search, X, ChevronDown, Calendar, Clock, Users, Lock } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useUserCity } from '@/hooks/useUserCity';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

interface EditPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: {
    id: string;
    user_id: string;
    venue_id: string | null;
    venue_name: string;
    plan_date: string;
    plan_time: string;
    description: string;
    visibility: string;
  };
  onPlanUpdated: () => void;
}

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
}

export function EditPlanDialog({ open, onOpenChange, plan, onPlanUpdated }: EditPlanDialogProps) {
  const [description, setDescription] = useState(plan.description || '');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(
    plan.venue_id ? { id: plan.venue_id, name: plan.venue_name, neighborhood: '' } : null
  );
  const [planDate, setPlanDate] = useState(plan.plan_date);
  const [planTime, setPlanTime] = useState(plan.plan_time);
  const [visibility, setVisibility] = useState<'friends' | 'close_friends'>(
    plan.visibility as 'friends' | 'close_friends'
  );
  const [venueSearch, setVenueSearch] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(true);
  const { city } = useUserCity();

  useEffect(() => {
    if (open && city) {
      fetchVenues();
    }
  }, [open, city]);

  useEffect(() => {
    if (open) {
      setDescription(plan.description || '');
      setSelectedVenue(plan.venue_id ? { id: plan.venue_id, name: plan.venue_name, neighborhood: '' } : null);
      setPlanDate(plan.plan_date);
      setPlanTime(plan.plan_time);
      setVisibility(plan.visibility as 'friends' | 'close_friends');
    }
  }, [open, plan]);

  const fetchVenues = async () => {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, neighborhood')
      .eq('city', city)
      .order('popularity_rank');

    if (!error && data) {
      setVenues(data);
      // Update selected venue with neighborhood info
      if (selectedVenue) {
        const matchingVenue = data.find(v => v.id === selectedVenue.id);
        if (matchingVenue) {
          setSelectedVenue(matchingVenue);
        }
      }
    }
  };

  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
    v.neighborhood.toLowerCase().includes(venueSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!selectedVenue) {
      toast.error('Please select a venue');
      return;
    }

    setIsSubmitting(true);

    try {
      // Expire at 5am the day AFTER the plan date
      const planDateObj = new Date(planDate);
      planDateObj.setDate(planDateObj.getDate() + 1);
      planDateObj.setHours(5, 0, 0, 0);
      const expiresAt = planDateObj;

      const { error } = await supabase
        .from('plans')
        .update({
          venue_id: selectedVenue.id,
          venue_name: selectedVenue.name,
          plan_date: planDate,
          plan_time: planTime,
          description: description.trim() || null,
          visibility,
          expires_at: expiresAt.toISOString()
        })
        .eq('id', plan.id)
        .eq('user_id', plan.user_id);

      if (error) throw error;

      toast.success('Plan updated! ✨');
      onOpenChange(false);
      onPlanUpdated();
    } catch (error) {
      console.error('Error updating plan:', error);
      toast.error('Failed to update plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(new Date(), i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'EEE, MMM d')
    };
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-transparent max-h-[70vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-foreground text-center">Edit Plan</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 flex flex-col h-full overflow-hidden">
          {/* Venue Selection */}
          {selectedVenue ? (
            <div 
              className="flex items-center gap-3 py-2 cursor-pointer group"
              onClick={() => setSelectedVenue(null)}
            >
              <MapPin className="w-5 h-5 text-[#d4ff00]" />
              <div className="flex-1">
                <p className="font-medium text-[#d4ff00]">{selectedVenue.name}</p>
                <p className="text-xs text-muted-foreground">{selectedVenue.neighborhood}</p>
              </div>
              <X className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Where are you going?"
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                className="pl-10 bg-background/30 border-border/30 h-11"
                autoFocus
              />
            </div>
          )}

          {/* Venue List */}
          {!selectedVenue && (
            <ScrollArea className="flex-1 mt-3 -mx-4 px-4">
              <div className="space-y-0.5">
                {filteredVenues.map(venue => (
                  <div
                    key={venue.id}
                    className="py-2.5 px-2 -mx-2 hover:bg-primary/10 cursor-pointer rounded-lg transition-colors"
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
            </ScrollArea>
          )}

          {/* Options when venue selected */}
          {selectedVenue && (
            <>
              <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions} className="mt-3">
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                  <ChevronDown className={`w-4 h-4 transition-transform ${showMoreOptions ? 'rotate-180' : ''}`} />
                  Options
                </CollapsibleTrigger>
                
                <CollapsibleContent className="space-y-4 pt-3">
                  {/* Date & Time */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                        <Calendar className="w-3 h-3" />
                        Date
                      </div>
                      <select
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                        className="w-full h-9 px-2 rounded-md bg-background/30 border border-border/30 text-foreground text-sm"
                      >
                        {dateOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                        <Clock className="w-3 h-3" />
                        Time
                      </div>
                      <Input
                        type="time"
                        value={planTime}
                        onChange={(e) => setPlanTime(e.target.value)}
                        className="bg-background/30 border-border/30 h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <Textarea
                    placeholder="Add a note... (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-background/30 border-border/30 min-h-[60px] resize-none text-sm"
                    maxLength={280}
                  />

                  {/* Visibility */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={visibility === 'friends' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setVisibility('friends')}
                      className={`h-8 text-xs ${visibility === 'friends' ? 'bg-primary' : 'text-muted-foreground'}`}
                    >
                      <Users className="w-3 h-3 mr-1" />
                      Friends
                    </Button>
                    <Button
                      type="button"
                      variant={visibility === 'close_friends' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setVisibility('close_friends')}
                      className={`h-8 text-xs ${visibility === 'close_friends' ? 'bg-primary' : 'text-muted-foreground'}`}
                    >
                      <Lock className="w-3 h-3 mr-1" />
                      Close Friends
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Update Button */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full mt-4 bg-primary hover:bg-primary/90 h-12 text-base font-semibold"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
