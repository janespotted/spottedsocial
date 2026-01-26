import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Plus, X, ChevronDown, Calendar, Clock, Users, Lock } from 'lucide-react';
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useUserCity } from '@/hooks/useUserCity';
import { useDemoMode } from '@/hooks/useDemoMode';

import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

interface PreselectedFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onPlanCreated: () => void;
  preselectedFriend?: PreselectedFriend | null;
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

export function CreatePlanDialog({ open, onOpenChange, userId, onPlanCreated, preselectedFriend }: CreatePlanDialogProps) {
  const [description, setDescription] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [planDate, setPlanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [planTime, setPlanTime] = useState('21:00');
  const [visibility, setVisibility] = useState<'friends' | 'close_friends'>('friends');
  const [venueSearch, setVenueSearch] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { city } = useUserCity();
  const demoEnabled = useDemoMode();
  
  const venueInputRef = useRef<HTMLInputElement>(null);
  const venueListRef = useRef<HTMLDivElement>(null);

  // Friend selection state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  
  // More options collapsed by default
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  useEffect(() => {
    if (open && city) {
      fetchVenues();
      fetchFriends();
      
      // If preselectedFriend provided, add them and open more options
      if (preselectedFriend) {
        setSelectedFriends([{
          id: preselectedFriend.id,
          display_name: preselectedFriend.display_name,
          avatar_url: preselectedFriend.avatar_url,
          username: '', // Not needed for display
        }]);
        setShowMoreOptions(true);
      }
    }
  }, [open, city, preselectedFriend]);

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
    const { data: friends1 } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('status', 'accepted');

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
      // Expire at 5am the day AFTER the plan date (matches nightlife rollover)
      const planDateObj = new Date(planDate);
      planDateObj.setDate(planDateObj.getDate() + 1);
      planDateObj.setHours(5, 0, 0, 0);
      const expiresAt = planDateObj;

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

      toast.success('Plan posted! 🎉');
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
    setSelectedFriends([]);
    setShowFriendPicker(false);
    setFriendSearch('');
    setShowMoreOptions(false);
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
      <DrawerContent className="bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] border-transparent max-h-[85vh]">
        <DrawerHeader className="pb-2 flex-shrink-0">
          <DrawerTitle className="text-foreground text-center">Share Your Plans</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Venue Search - Always Visible */}
          {selectedVenue ? (
            <div 
              className="flex items-center gap-3 py-2 cursor-pointer group flex-shrink-0"
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
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
              <Input
                ref={venueInputRef}
                placeholder="Where are you going?"
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                className="pl-10 bg-background/30 border-border/30 h-11"
                autoFocus
              />
            </div>
          )}

          {/* Venue List - Shows when no venue selected */}
          {!selectedVenue && (
            <div 
              ref={venueListRef}
              className="flex-1 mt-3 -mx-4 px-4 overflow-y-auto overscroll-contain touch-pan-y"
              style={{ 
                maxHeight: '50vh',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <div className="space-y-0.5 pb-4">
                {filteredVenues.map(venue => (
                  <div
                    key={venue.id}
                    className="py-2.5 px-2 -mx-2 hover:bg-primary/10 active:bg-primary/20 cursor-pointer rounded-lg transition-colors"
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
            </div>
          )}

          {/* Show more options and button only when venue is selected */}
          {selectedVenue && (
            <>
              {/* More Options - Collapsed by Default */}
              <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions} className="mt-3">
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                  <ChevronDown className={`w-4 h-4 transition-transform ${showMoreOptions ? 'rotate-180' : ''}`} />
                  More Options
                  {(selectedFriends.length > 0 || description) && (
                    <span className="text-xs text-primary ml-auto">
                      {selectedFriends.length > 0 && `${selectedFriends.length} friends`}
                      {selectedFriends.length > 0 && description && ' • '}
                      {description && 'note added'}
                    </span>
                  )}
                </CollapsibleTrigger>
                
                <CollapsibleContent className="space-y-4 pt-3">
                  {/* Date & Time - Inline */}
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

                  {/* Friends */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedFriends.map(friend => (
                        <div 
                          key={friend.id} 
                          className="relative group"
                          onClick={() => toggleFriend(friend)}
                        >
                          <Avatar className="h-8 w-8 border-2 border-primary cursor-pointer">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/20 text-primary text-xs">
                              {friend.display_name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute -top-1 -right-1 bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <X className="w-2.5 h-2.5 text-white" />
                          </div>
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFriendPicker(!showFriendPicker)}
                        className="text-muted-foreground hover:text-foreground gap-1 h-8 px-2"
                      >
                        <Plus className="w-4 h-4" />
                        {selectedFriends.length === 0 ? 'Add Friends' : ''}
                      </Button>
                    </div>

                    {showFriendPicker && (
                      <div className="mt-2 space-y-2">
                        <Input
                          placeholder="Search friends..."
                          value={friendSearch}
                          onChange={(e) => setFriendSearch(e.target.value)}
                          className="bg-background/30 border-border/30 h-9 text-sm"
                        />
                        <ScrollArea className="h-[120px]">
                          {filteredFriends.length === 0 ? (
                            <p className="text-center text-muted-foreground py-4 text-sm">No friends found</p>
                          ) : (
                            filteredFriends.map(friend => {
                              const isSelected = selectedFriends.some(f => f.id === friend.id);
                              return (
                                <div
                                  key={friend.id}
                                  className="flex items-center gap-2 py-1.5 hover:bg-primary/10 rounded-lg cursor-pointer px-1"
                                  onClick={() => toggleFriend(friend)}
                                >
                                  <Checkbox checked={isSelected} className="border-primary h-4 w-4" />
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={friend.avatar_url || undefined} />
                                    <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                                      {friend.display_name.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm text-foreground truncate">{friend.display_name}</span>
                                </div>
                              );
                            })
                          )}
                        </ScrollArea>
                      </div>
                    )}
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

              {/* Post Button - Always Visible when venue selected */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full mt-4 bg-primary hover:bg-primary/90 h-12 text-base font-semibold"
              >
                {isSubmitting ? 'Posting...' : 'Post Plan'}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
