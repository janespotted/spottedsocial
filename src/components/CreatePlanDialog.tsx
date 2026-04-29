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
    <div className="fixed inset-0 z-[500] bg-[#110a24] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 flex-shrink-0">
        <button
          onClick={() => { resetForm(); onOpenChange(false); }}
          className="p-1 text-white/60 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-semibold text-base">New Plan</span>
        <div className="w-7" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ overscrollBehavior: 'contain' }}>
        {/* Step 1: Venue (always visible) */}
        <div className="mb-6">
          {selectedVenue ? (
            <button
              onClick={() => setSelectedVenue(null)}
              className="w-full flex items-center gap-3 py-3 group"
            >
              <div className="w-10 h-10 rounded-full bg-[#d4ff00]/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#d4ff00]" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-medium">{selectedVenue.name}</p>
                <p className="text-white/40 text-xs">{selectedVenue.neighborhood}</p>
              </div>
              <X className="w-4 h-4 text-white/30 group-hover:text-white/60" />
            </button>
          ) : (
            <>
              <div className="sticky top-0 z-10 bg-[#110a24] pb-2 -mx-5 px-5 pt-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <Input
                    ref={venueInputRef}
                    placeholder="Where are you going?"
                    value={venueSearch}
                    onChange={(e) => setVenueSearch(e.target.value)}
                    className="pl-10 h-12 bg-[#1a1230] border-white/8 text-white placeholder:text-white/25 rounded-2xl text-[15px] focus:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                  />
                </div>
              </div>
              <div className="mt-1 pb-40">
                {filteredVenues.map(venue => (
                  <button
                    key={venue.id}
                    onClick={() => { setSelectedVenue(venue); setVenueSearch(''); }}
                    className="w-full text-left py-3 px-1 hover:bg-white/5 rounded-xl transition-colors"
                  >
                    <p className="text-white text-[15px]">{venue.name}</p>
                    <p className="text-white/35 text-xs">{venue.neighborhood}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Step 2: Details (shown after venue selected) */}
        {selectedVenue && (
          <div className="space-y-5">
            {/* Date & Time */}
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white/40 text-xs mb-1.5">When</p>
                <select
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#1a1230] border border-white/8 text-white text-sm appearance-none"
                >
                  {dateOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/40 text-xs mb-1.5">Time</p>
                <Input
                  type="time"
                  value={planTime}
                  onChange={(e) => setPlanTime(e.target.value)}
                  className="w-full h-11 bg-[#1a1230] border-white/8 text-white rounded-xl text-sm focus:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <p className="text-white/40 text-xs mb-1.5">Note</p>
              <textarea
                placeholder="What's the plan?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                rows={2}
                className="w-full bg-[#1a1230] border border-white/8 text-white placeholder:text-white/25 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Friends */}
            <div>
              <p className="text-white/40 text-xs mb-1.5">Invite friends</p>

              {selectedFriends.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {selectedFriends.map(friend => (
                    <button
                      key={friend.id}
                      onClick={() => toggleFriend(friend)}
                      className="flex items-center gap-1.5 bg-[#1a1230] border border-white/8 rounded-full pl-1 pr-2.5 py-1 hover:bg-white/10 transition-colors"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0a2e] text-white text-[9px]">{friend.display_name[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-white">{friend.display_name.split(' ')[0]}</span>
                      <X className="w-3 h-3 text-white/30" />
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <Input
                  placeholder="Search friends..."
                  value={friendSearch}
                  onChange={(e) => { setFriendSearch(e.target.value); setShowFriendPicker(true); }}
                  onFocus={() => setShowFriendPicker(true)}
                  className="pl-10 h-10 bg-[#1a1230] border-white/8 text-white placeholder:text-white/25 rounded-xl text-sm focus:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {showFriendPicker && filteredFriends.length > 0 && (
                <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.03]">
                  {filteredFriends.map(friend => {
                    const isSelected = selectedFriends.some(f => f.id === friend.id);
                    return (
                      <button
                        key={friend.id}
                        onClick={() => { toggleFriend(friend); setFriendSearch(''); }}
                        className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 transition-colors"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#1a0a2e] text-white text-xs">{friend.display_name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-white text-sm truncate">{friend.display_name}</p>
                          <p className="text-white/30 text-xs truncate">@{friend.username}</p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#d4ff00]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Visibility */}
            <div>
              <p className="text-white/40 text-xs mb-1.5">Who can see this</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setVisibility('friends')}
                  className={`flex-1 py-2 rounded-full text-xs font-medium transition-colors ${
                    visibility === 'friends'
                      ? 'bg-[#d4ff00] text-black'
                      : 'bg-[#1a1230] text-white/50 border border-white/8'
                  }`}
                >
                  All Friends
                </button>
                <button
                  onClick={() => setVisibility('close_friends')}
                  className={`flex-1 py-2 rounded-full text-xs font-medium transition-colors ${
                    visibility === 'close_friends'
                      ? 'bg-[#d4ff00] text-black'
                      : 'bg-[#1a1230] text-white/50 border border-white/8'
                  }`}
                >
                  Close Friends
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      {selectedVenue && (
        <div className="px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-12 bg-[#d4ff00] text-black font-semibold text-base rounded-2xl hover:bg-[#d4ff00]/90 disabled:opacity-40 transition-colors"
          >
            {isSubmitting ? 'Sharing...' : 'Share Plan'}
          </button>
        </div>
      )}
    </div>
  );
}
