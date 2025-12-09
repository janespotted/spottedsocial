import { useState, useEffect } from 'react';
import { MapPin, Calendar, Clock, Users, Lock, Search, Plus, X } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useUserCity } from '@/hooks/useUserCity';
import { useDemoMode } from '@/hooks/useDemoMode';
import { toast } from 'sonner';
import { format, addDays, endOfDay } from 'date-fns';

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onPlanCreated: () => void;
}

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
}

interface Friend {
  id: string;
  display_name: string;
  avatar_url: string | null;
  username: string;
}

export function CreatePlanDialog({ open, onOpenChange, userId, onPlanCreated }: CreatePlanDialogProps) {
  const [description, setDescription] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [planDate, setPlanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [planTime, setPlanTime] = useState('21:00');
  const [visibility, setVisibility] = useState<'friends' | 'close_friends'>('friends');
  const [venueSearch, setVenueSearch] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [showVenueList, setShowVenueList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { city } = useUserCity();
  const demoEnabled = useDemoMode();

  // Friend selection state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');

  useEffect(() => {
    if (open && city) {
      fetchVenues();
      fetchFriends();
    }
  }, [open, city]);

  const fetchVenues = async () => {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, neighborhood')
      .eq('city', city)
      .order('popularity_rank');

    if (!error && data) {
      setVenues(data);
    }
  };

  const fetchFriends = async () => {
    // Fetch friends where user is user_id
    const { data: friends1 } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('status', 'accepted');

    // Fetch friends where user is friend_id
    const { data: friends2 } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('friend_id', userId)
      .eq('status', 'accepted');

    const friendIds = [
      ...(friends1?.map(f => f.friend_id) || []),
      ...(friends2?.map(f => f.user_id) || [])
    ];

    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }

    let query = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, username')
      .in('id', friendIds)
      .order('display_name');

    // Filter demo users in bootstrap mode
    if (!demoEnabled) {
      query = query.eq('is_demo', false);
    }

    const { data: profiles } = await query;
    setFriends(profiles || []);
  };

  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
    v.neighborhood.toLowerCase().includes(venueSearch.toLowerCase())
  );

  const filteredFriends = friends.filter(f =>
    f.display_name.toLowerCase().includes(friendSearch.toLowerCase()) ||
    f.username.toLowerCase().includes(friendSearch.toLowerCase())
  );

  const toggleFriend = (friend: Friend) => {
    setSelectedFriends(prev => {
      const isSelected = prev.some(f => f.id === friend.id);
      if (isSelected) {
        return prev.filter(f => f.id !== friend.id);
      }
      return [...prev, friend];
    });
  };

  const handleSubmit = async () => {
    if (!selectedVenue) {
      toast.error('Please select a venue');
      return;
    }

    setIsSubmitting(true);

    try {
      const expiresAt = endOfDay(new Date(planDate));

      const { data: plan, error } = await supabase.from('plans').insert({
        user_id: userId,
        venue_id: selectedVenue.id,
        venue_name: selectedVenue.name,
        plan_date: planDate,
        plan_time: planTime,
        description: description.trim() || null,
        visibility,
        expires_at: expiresAt.toISOString()
      }).select('id').single();

      if (error) throw error;

      // Add selected friends as participants
      if (selectedFriends.length > 0 && plan) {
        const participants = selectedFriends.map(friend => ({
          plan_id: plan.id,
          user_id: friend.id
        }));

        const { error: participantsError } = await supabase
          .from('plan_participants')
          .insert(participants);

        if (participantsError) {
          console.error('Error adding participants:', participantsError);
        }
      }

      toast.success('Plan shared! 🎉');
      resetForm();
      onPlanCreated();
    } catch (error) {
      console.error('Error creating plan:', error);
      toast.error('Failed to create plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setDescription('');
    setSelectedVenue(null);
    setPlanDate(format(new Date(), 'yyyy-MM-dd'));
    setPlanTime('21:00');
    setVisibility('friends');
    setVenueSearch('');
    setShowVenueList(false);
    setSelectedFriends([]);
    setShowFriendPicker(false);
    setFriendSearch('');
  };

  // Generate next 7 days for date picker
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(new Date(), i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'EEE, MMM d')
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-foreground">Share Your Plans</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 pr-2">
            {/* Venue Selection */}
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Where are you going?
              </Label>
              {selectedVenue ? (
                <div 
                  className="flex items-center justify-between p-3 bg-card/50 rounded-lg border border-primary/30 cursor-pointer"
                  onClick={() => {
                    setSelectedVenue(null);
                    setShowVenueList(true);
                  }}
                >
                  <div>
                    <p className="font-medium text-[#d4ff00]">{selectedVenue.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedVenue.neighborhood}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">Change</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search venues..."
                      value={venueSearch}
                      onChange={(e) => {
                        setVenueSearch(e.target.value);
                        setShowVenueList(true);
                      }}
                      onFocus={() => setShowVenueList(true)}
                      className="pl-10 bg-card/50 border-border/50"
                    />
                  </div>
                  {showVenueList && (
                    <ScrollArea className="h-[150px] rounded-lg border border-border/30 bg-card/50">
                      {filteredVenues.map(venue => (
                        <div
                          key={venue.id}
                          className="p-3 hover:bg-primary/10 cursor-pointer border-b border-border/20 last:border-0"
                          onClick={() => {
                            setSelectedVenue(venue);
                            setShowVenueList(false);
                            setVenueSearch('');
                          }}
                        >
                          <p className="font-medium text-foreground">{venue.name}</p>
                          <p className="text-xs text-muted-foreground">{venue.neighborhood}</p>
                        </div>
                      ))}
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date
                </Label>
                <select
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-card/50 border border-border/50 text-foreground"
                >
                  {dateOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time
                </Label>
                <Input
                  type="time"
                  value={planTime}
                  onChange={(e) => setPlanTime(e.target.value)}
                  className="bg-card/50 border-border/50"
                />
              </div>
            </div>

            {/* Friends Going With You */}
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Who's going with you?
              </Label>
              
              <div className="flex items-center gap-2 flex-wrap">
                {selectedFriends.map(friend => (
                  <div 
                    key={friend.id} 
                    className="relative group"
                    onClick={() => toggleFriend(friend)}
                  >
                    <Avatar className="h-10 w-10 border-2 border-primary cursor-pointer">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {friend.display_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -top-1 -right-1 bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <X className="w-3 h-3 text-white" />
                    </div>
                  </div>
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFriendPicker(!showFriendPicker)}
                  className="border-primary/50 text-primary hover:bg-primary/10 gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Friends
                </Button>
              </div>

              {showFriendPicker && (
                <div className="space-y-2 p-3 bg-card/50 rounded-lg border border-border/30">
                  <Input
                    placeholder="Search friends..."
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    className="bg-background/50 border-border/50"
                  />
                  <ScrollArea className="h-[150px]">
                    {filteredFriends.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4 text-sm">No friends found</p>
                    ) : (
                      filteredFriends.map(friend => {
                        const isSelected = selectedFriends.some(f => f.id === friend.id);
                        return (
                          <div
                            key={friend.id}
                            className="flex items-center gap-3 p-2 hover:bg-primary/10 rounded-lg cursor-pointer"
                            onClick={() => toggleFriend(friend)}
                          >
                            <Checkbox checked={isSelected} className="border-primary" />
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={friend.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                {friend.display_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground text-sm truncate">
                                {friend.display_name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                @{friend.username}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* Description - Now Optional */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                What's the plan? <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Textarea
                placeholder="Celebrating a birthday, checking out a new DJ, just looking for company..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-card/50 border-border/50 min-h-[80px] resize-none"
                maxLength={280}
              />
              <p className="text-xs text-muted-foreground text-right">{description.length}/280</p>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Who can see this?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={visibility === 'friends' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVisibility('friends')}
                  className={visibility === 'friends' ? 'bg-primary' : 'border-border/50'}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Friends
                </Button>
                <Button
                  type="button"
                  variant={visibility === 'close_friends' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVisibility('close_friends')}
                  className={visibility === 'close_friends' ? 'bg-primary' : 'border-border/50'}
                >
                  <Lock className="w-4 h-4 mr-1" />
                  Close Friends
                </Button>
              </div>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedVenue}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? 'Sharing...' : 'Share Plan'}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}