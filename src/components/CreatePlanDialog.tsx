import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Plus, X, ChevronDown, Calendar, Clock, Users, Lock, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useUserCity } from '@/hooks/useUserCity';
import { useFriendIds } from '@/hooks/useFriendIds';
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
  const queryClient = useQueryClient();
  const { data: friendIdData } = useFriendIds(userId);
  
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
    const friendIds = friendIdData || [];

    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }

    // Use cached profiles from get_profiles_safe (bypasses RLS)
    const allProfiles: any[] = queryClient.getQueryData(['profiles-safe']) || [];
    let friendProfiles = allProfiles
      .filter((p: any) => friendIds.includes(p.id))
      .map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        username: p.username,
      }))
      .sort((a: Friend, b: Friend) => a.display_name.localeCompare(b.display_name));

    if (!demoEnabled) {
      const demoIds = new Set(allProfiles.filter((p: any) => p.is_demo).map((p: any) => p.id));
      friendProfiles = friendProfiles.filter(f => !demoIds.has(f.id));
    }

    setFriends(friendProfiles);
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
      // Use local date constructor to avoid UTC midnight parsing bug
      const [year, month, day] = planDate.split('-').map(Number);
      const expiresAt = new Date(year, month - 1, day + 1, 5, 0, 0, 0);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          onClick={() => {
            resetForm();
            onOpenChange(false);
          }}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-foreground font-semibold text-lg">Share Your Plans</h2>
      </div>

      <div className="px-4 pb-6 flex flex-col flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 60px)' }}>
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
            className="flex-1 mt-3 -mx-4 px-4 overflow-y-auto overscroll-contain touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
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
          <div className="flex-1 overflow-y-auto mt-3 -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="space-y-4">
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
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <Users className="w-3 h-3" />
                    Going with
                  </div>

                  {/* Selected friends chips */}
                  {selectedFriends.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {selectedFriends.map(friend => (
                        <div
                          key={friend.id}
                          className="flex items-center gap-1.5 bg-primary/20 border border-primary/30 rounded-full pl-1 pr-2 py-0.5 cursor-pointer hover:bg-primary/30 transition-colors"
                          onClick={() => toggleFriend(friend)}
                        >
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/30 text-primary text-[9px]">
                              {friend.display_name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground">{friend.display_name.split(' ')[0]}</span>
                          <X className="w-3 h-3 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search friends to add..."
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      onFocus={() => setShowFriendPicker(true)}
                      className="bg-background/30 border-border/30 h-9 text-sm pl-8"
                    />
                  </div>

                  {/* Friends list - always visible when focused or has search */}
                  {(showFriendPicker || friendSearch) && (
                    <ScrollArea className="h-[140px] mt-2 rounded-lg border border-border/20 bg-background/20">
                      {filteredFriends.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-sm">No friends found</p>
                      ) : (
                        filteredFriends.map(friend => {
                          const isSelected = selectedFriends.some(f => f.id === friend.id);
                          return (
                            <div
                              key={friend.id}
                              className={`flex items-center gap-2.5 py-2 px-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-primary/15' : 'hover:bg-primary/10'}`}
                              onClick={() => toggleFriend(friend)}
                            >
                              <Checkbox checked={isSelected} className="border-primary h-4 w-4" />
                              <Avatar className="h-7 w-7 border border-primary/30">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                                  {friend.display_name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-foreground truncate block">{friend.display_name}</span>
                                <span className="text-xs text-muted-foreground truncate block">@{friend.username}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                            </div>
                          );
                        })
                      )}
                    </ScrollArea>
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
            </div>

            {/* Post Button */}
            <div className="sticky bottom-0 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] bg-gradient-to-t from-[#0a0118] via-[#0a0118] to-transparent">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-[#d4ff00] hover:bg-[#d4ff00]/90 text-[#0a0118] h-12 text-base font-bold rounded-xl"
              >
                {isSubmitting ? 'Posting...' : 'Share Plan'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
