import { useEffect, useState } from 'react';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { MapPin, Plus, Check, Star, Pencil, ChevronDown, Clock } from 'lucide-react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { ReviewCard } from './ReviewCard';
import { WriteReviewDialog } from './WriteReviewDialog';
import { VenueHoursDisplay, getHoursDisplayString } from '@/lib/venue-hours';
import type { VenueHours } from '@/lib/venue-hours';

interface VenueData {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  type: string;
  lat: number;
  lng: number;
}

interface FriendAtVenue {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Review {
  id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  is_anonymous: boolean;
  score: number;
  created_at: string;
  image_url?: string | null;
  profile?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface UserVote {
  review_id: string;
  vote_type: 'up' | 'down';
}

export function VenueIdCard() {
  const { selectedVenueId, closeVenueCard, openVenueCard } = useVenueIdCard();
  const { openFriendCard } = useFriendIdCard();
  const { user } = useAuth();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendAtVenue[]>([]);
  const [distance, setDistance] = useState<string>('--');
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userVotes, setUserVotes] = useState<UserVote[]>([]);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [hasUserReviewed, setHasUserReviewed] = useState(false);
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [venueHours, setVenueHours] = useState<VenueHoursDisplay | null>(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const [googlePhotos, setGooglePhotos] = useState<string[]>([]);
  const [googleRating, setGoogleRating] = useState<number | null>(null);
  const [googleRatingsCount, setGoogleRatingsCount] = useState<number>(0);
  const [similarVenues, setSimilarVenues] = useState<Array<{
    id: string;
    name: string;
    neighborhood: string;
    google_rating: number | null;
  }>>([]);
  const [similarVenuesOpen, setSimilarVenuesOpen] = useState(false);

  useEffect(() => {
    if (selectedVenueId) {
      fetchVenueData();
      fetchReviews();
      fetchVenueHours();
    }
  }, [selectedVenueId]);

  useEffect(() => {
    if (venue) {
      fetchSimilarVenues();
    }
  }, [venue?.id]);

  const fetchVenueHours = async () => {
    if (!selectedVenueId) return;

    setLoadingHours(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-venue-hours', {
        body: { venueId: selectedVenueId }
      });

      if (error) {
        console.error('Error fetching venue hours:', error);
        setVenueHours(null);
        return;
      }

      if (data?.operating_hours) {
        const hoursDisplay = getHoursDisplayString(data.operating_hours as VenueHours);
        setVenueHours(hoursDisplay);
      } else {
        setVenueHours(null);
      }

      // Set Google data
      if (data?.google_photo_refs && Array.isArray(data.google_photo_refs)) {
        setGooglePhotos(data.google_photo_refs);
      } else {
        setGooglePhotos([]);
      }

      if (data?.google_rating) {
        setGoogleRating(data.google_rating);
      } else {
        setGoogleRating(null);
      }

      if (data?.google_user_ratings_total) {
        setGoogleRatingsCount(data.google_user_ratings_total);
      } else {
        setGoogleRatingsCount(0);
      }
    } catch (error) {
      console.error('Error fetching venue hours:', error);
      setVenueHours(null);
    } finally {
      setLoadingHours(false);
    }
  };

  const fetchVenueData = async () => {
    if (!selectedVenueId || !user) return;

    try {
      // Fetch venue data
      const { data: venueData } = await supabase
        .from('venues')
        .select('*')
        .eq('id', selectedVenueId)
        .single();

      if (venueData) {
        setVenue(venueData);

        // Check if venue is in wishlist
        const { data: wishlistEntry } = await supabase
          .from('wishlist_places')
          .select('id')
          .eq('user_id', user.id)
          .eq('venue_name', venueData.name)
          .maybeSingle();

        setIsInWishlist(!!wishlistEntry);

        // Get user's location for distance calculation
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('last_known_lat, last_known_lng')
          .eq('id', user.id)
          .single();

        if (myProfile?.last_known_lat && myProfile?.last_known_lng) {
          const dist = calculateDistance(
            myProfile.last_known_lat,
            myProfile.last_known_lng,
            venueData.lat,
            venueData.lng
          );
          setDistance(dist);
        }

        // Fetch friends at this venue
        const { data: statuses } = await supabase
          .from('night_statuses')
          .select('user_id')
          .eq('venue_name', venueData.name)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString());

        if (statuses && statuses.length > 0) {
          const userIds = statuses.map(s => s.user_id);
          
          // Get friend profiles
          const { data: friendships } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

          const friendIds = friendships?.map(f => f.friend_id) || [];
          const friendsAtVenueIds = userIds.filter(id => friendIds.includes(id));

          if (friendsAtVenueIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .in('id', friendsAtVenueIds);

            setFriendsAtVenue(profiles || []);
          } else {
            setFriendsAtVenue([]);
          }
        } else {
          setFriendsAtVenue([]);
        }
      }
    } catch (error) {
      console.error('Error fetching venue data:', error);
    }
  };

  const fetchReviews = async () => {
    if (!selectedVenueId || !user) return;

    try {
      // Fetch reviews with profile data
      const { data: reviewsData } = await supabase
        .from('venue_reviews')
        .select('*')
        .eq('venue_id', selectedVenueId)
        .order('score', { ascending: false })
        .order('created_at', { ascending: false });

      if (reviewsData && reviewsData.length > 0) {
        // Fetch profiles for non-anonymous reviews
        const nonAnonUserIds = reviewsData
          .filter(r => !r.is_anonymous)
          .map(r => r.user_id);

        let profilesMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
        
        if (nonAnonUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', nonAnonUserIds);

          if (profiles) {
            profilesMap = profiles.reduce((acc, p) => {
              acc[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
              return acc;
            }, {} as typeof profilesMap);
          }
        }

        const enrichedReviews = reviewsData.map(r => ({
          ...r,
          profile: profilesMap[r.user_id]
        }));

        setReviews(enrichedReviews);

        // Calculate average rating
        const avgRating = reviewsData.reduce((sum, r) => sum + r.rating, 0) / reviewsData.length;
        setAverageRating(avgRating);

        // Check if user has reviewed
        setHasUserReviewed(reviewsData.some(r => r.user_id === user.id));
      } else {
        setReviews([]);
        setAverageRating(0);
        setHasUserReviewed(false);
      }

      // Fetch user's votes
      const { data: votes } = await supabase
        .from('review_votes')
        .select('review_id, vote_type')
        .eq('user_id', user.id);

      setUserVotes(votes as UserVote[] || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  };

  const fetchSimilarVenues = async () => {
    if (!selectedVenueId || !venue) return;

    try {
      // First try to find venues in the same neighborhood and city
      let { data: similar } = await supabase
        .from('venues')
        .select('id, name, neighborhood, google_rating')
        .eq('neighborhood', venue.neighborhood)
        .eq('city', venue.city)
        .neq('id', selectedVenueId)
        .order('popularity_rank', { ascending: true })
        .limit(4);

      // If not enough venues in the same neighborhood, fall back to same city
      if (!similar || similar.length < 3) {
        const { data: cityVenues } = await supabase
          .from('venues')
          .select('id, name, neighborhood, google_rating')
          .eq('city', venue.city)
          .neq('id', selectedVenueId)
          .order('popularity_rank', { ascending: true })
          .limit(4);

        similar = cityVenues || [];
      }

      setSimilarVenues(similar || []);
    } catch (error) {
      console.error('Error fetching similar venues:', error);
      setSimilarVenues([]);
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance.toFixed(1);
  };

  const handleMapPinClick = () => {
    if (venue) {
      // Open Apple Maps with directions from current location to venue
      const appleMapsUrl = `https://maps.apple.com/?daddr=${venue.lat},${venue.lng}&dirflg=d`;
      window.open(appleMapsUrl, '_blank');
    }
  };

  const handleWishlistToggle = async () => {
    if (!venue || !user) return;

    if (isInWishlist) {
      // Remove from wishlist
      await supabase
        .from('wishlist_places')
        .delete()
        .eq('user_id', user.id)
        .eq('venue_name', venue.name);

      setIsInWishlist(false);
      haptic.light();
      toast.success('Removed from wishlist');
    } else {
      // Add to wishlist
      await supabase
        .from('wishlist_places')
        .insert({
          user_id: user.id,
          venue_name: venue.name,
          venue_image_url: null
        });

      setIsInWishlist(true);
      haptic.success();
      toast.success('Added to wishlist! 🎉');
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeDown: closeVenueCard,
    threshold: 50
  });

  const getUserVote = (reviewId: string): 'up' | 'down' | null => {
    const vote = userVotes.find(v => v.review_id === reviewId);
    return vote?.vote_type || null;
  };

  if (!selectedVenueId || !venue) return null;

  const visibleFriends = friendsAtVenue.slice(0, 4);
  const remainingCount = friendsAtVenue.length - visibleFriends.length;

  return (
    <>
      <Dialog open={!!selectedVenueId} onOpenChange={(open) => !open && closeVenueCard()}>
        <DialogContent 
          className="w-[90%] max-w-[400px] max-h-[85vh] bg-[#1a0f2e]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl p-0 overflow-hidden"
          {...swipeHandlers}
        >
          <ScrollArea className="max-h-[85vh]">
            <div className="p-5">
              {/* Photo Carousel */}
              {googlePhotos.length > 0 ? (
                <div className="relative mb-4 -mx-5 -mt-5">
                  <Carousel className="w-full">
                    <CarouselContent>
                      {googlePhotos.map((photoUrl, index) => (
                        <CarouselItem key={index}>
                          <div className="relative w-full h-56 overflow-hidden">
                            <img
                              src={photoUrl}
                              alt={`${venue.name} photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    {googlePhotos.length > 1 && (
                      <>
                        <CarouselPrevious className="left-2 bg-white/90 hover:bg-white border-none" />
                        <CarouselNext className="right-2 bg-white/90 hover:bg-white border-none" />
                      </>
                    )}
                  </Carousel>
                  {/* Wishlist toggle button overlaid on carousel */}
                  <button
                    onClick={handleWishlistToggle}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-[#d4ff00] border-2 border-[#2d1b4e] flex items-center justify-center shadow-[0_0_15px_rgba(212,255,0,0.6)] hover:scale-110 transition-transform z-10"
                    aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
                  >
                    {isInWishlist ? (
                      <Check className="w-5 h-5 text-[#2d1b4e]" />
                    ) : (
                      <Plus className="w-5 h-5 text-[#2d1b4e]" />
                    )}
                  </button>
                </div>
              ) : (
                /* Fallback gradient if no photos */
                <div className="relative mb-4 -mx-5 -mt-5">
                  <div className="w-full h-56 bg-gradient-to-br from-[#a855f7]/40 to-[#d4ff00]/40" />
                  {/* Wishlist toggle button */}
                  <button
                    onClick={handleWishlistToggle}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-[#d4ff00] border-2 border-[#2d1b4e] flex items-center justify-center shadow-[0_0_15px_rgba(212,255,0,0.6)] hover:scale-110 transition-transform"
                    aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
                  >
                    {isInWishlist ? (
                      <Check className="w-5 h-5 text-[#2d1b4e]" />
                    ) : (
                      <Plus className="w-5 h-5 text-[#2d1b4e]" />
                    )}
                  </button>
                </div>
              )}

              {/* Venue Info */}
              <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                  <h2 className="text-2xl font-bold text-white flex-1">
                    {venue.name}
                  </h2>
                </div>

                <p className="text-sm text-white/60 italic mb-2">
                  {venue.neighborhood} ({distance} miles)
                </p>

                {/* Google Rating */}
                {googleRating && (
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-[#d4ff00] fill-[#d4ff00]" />
                    <span className="text-white font-medium">
                      {googleRating.toFixed(1)}
                    </span>
                    <span className="text-white/50 text-sm">
                      on Google ({googleRatingsCount.toLocaleString()})
                    </span>
                  </div>
                )}
                
                {/* Operating Hours Status */}
                {venueHours && !loadingHours && (
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      venueHours.isOpen 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {venueHours.isOpen ? 'Open' : 'Closed'}
                    </span>
                    <span className="text-xs text-white/50 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {venueHours.displayText}
                    </span>
                  </div>
                )}
                {loadingHours && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Checking hours...</span>
                  </div>
                )}
              </div>

              {/* Friends + Map Pin */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#a855f7]/20">
                {/* Friend Avatars */}
                <div className="flex items-center gap-2">
                  {friendsAtVenue.length > 0 ? (
                    <>
                      <div className="flex -space-x-2">
                        {visibleFriends.map((friend) => (
                          <Avatar 
                            key={friend.id}
                            className="w-10 h-10 border-2 border-[#2d1b4e] cursor-pointer hover:scale-110 transition-transform"
                            onClick={() => openFriendCard({
                              userId: friend.id,
                              displayName: friend.display_name,
                              avatarUrl: friend.avatar_url,
                              venueName: venue?.name,
                            })}
                          >
                            <AvatarImage 
                              src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} 
                            />
                            <AvatarFallback className="bg-[#a855f7] text-white">
                              {friend.display_name[0]}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      {remainingCount > 0 && (
                        <span className="text-sm text-white/60 ml-1">
                          +{remainingCount}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-white/40">No friends here yet</span>
                  )}
                </div>

                {/* Map Pin Button */}
                <button
                  onClick={handleMapPinClick}
                  className="w-12 h-12 rounded-full bg-white hover:bg-white/90 flex items-center justify-center shadow-lg transition-all hover:scale-110"
                  aria-label="Show on map"
                >
                  <MapPin className="w-6 h-6 text-[#a855f7]" />
                </button>
              </div>

              {/* Reviews Section */}
              <div>
                <Collapsible open={reviewsOpen} onOpenChange={setReviewsOpen}>
                  <CollapsibleTrigger className="w-full group">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#a855f7]/5 hover:bg-[#a855f7]/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">Reviews</h3>
                        {reviews.length > 0 && (
                          <>
                            <span className="text-[#d4ff00] flex items-center gap-1">
                              {averageRating.toFixed(1)} <Star className="w-4 h-4 fill-[#d4ff00]" />
                            </span>
                            <span className="text-white/40 text-sm">({reviews.length})</span>
                          </>
                        )}
                      </div>
                      <ChevronDown className={`w-5 h-5 text-white/60 transition-transform duration-300 ${reviewsOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="pt-3">
                    {reviews.length > 0 ? (
                      <div className="space-y-3">
                        {reviews.slice(0, 5).map((review) => (
                          <ReviewCard
                            key={review.id}
                            review={review}
                            currentUserVote={getUserVote(review.id)}
                            onVoteChange={fetchReviews}
                          />
                        ))}
                        {reviews.length > 5 && (
                          <p className="text-sm text-white/50 text-center">
                            +{reviews.length - 5} more reviews
                          </p>
                        )}
                        
                        {/* Write Review Button at Bottom */}
                        {!hasUserReviewed && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowWriteReview(true)}
                            className="w-full mt-2 text-[#d4ff00] border-[#d4ff00]/30 hover:bg-[#d4ff00]/10 hover:border-[#d4ff00]"
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Write a Review
                          </Button>
                        )}
                      </div>
                    ) : (
                      /* Empty State */
                      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                        <Star className="w-12 h-12 text-white/20 mb-3" />
                        <p className="text-white/40 text-sm mb-1">No reviews yet</p>
                        <p className="text-white/30 text-xs mb-4">Be the first to share your experience!</p>
                        {!hasUserReviewed && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setShowWriteReview(true)}
                            className="bg-[#d4ff00] text-[#2d1b4e] hover:bg-[#d4ff00]/90 font-semibold"
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Write First Review
                          </Button>
                        )}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Similar Venues Section */}
              {similarVenues.length > 0 && (
                <div className="mt-4">
                  <Collapsible open={similarVenuesOpen} onOpenChange={setSimilarVenuesOpen}>
                    <CollapsibleTrigger className="w-full group">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-[#a855f7]/5 hover:bg-[#a855f7]/10 transition-colors">
                        <h3 className="text-lg font-semibold text-white">Similar Venues</h3>
                        <ChevronDown className={`w-5 h-5 text-white/60 transition-transform duration-300 ${similarVenuesOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="pt-3">
                      <div className="space-y-2">
                        {similarVenues.map((simVenue) => (
                          <button
                            key={simVenue.id}
                            onClick={() => {
                              closeVenueCard();
                              // Small delay to allow close animation, then open new venue
                              setTimeout(() => {
                                openVenueCard(simVenue.id);
                              }, 150);
                            }}
                            className="w-full p-3 rounded-lg bg-[#2d1b4e]/50 border border-[#a855f7]/20 hover:bg-[#2d1b4e]/70 hover:border-[#a855f7]/40 transition-all text-left"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-white font-medium">{simVenue.name}</p>
                                <p className="text-white/50 text-sm">{simVenue.neighborhood}</p>
                              </div>
                              {simVenue.google_rating && (
                                <div className="flex items-center gap-1 ml-2">
                                  <Star className="w-4 h-4 text-[#d4ff00] fill-[#d4ff00]" />
                                  <span className="text-white/70 text-sm">{simVenue.google_rating.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <WriteReviewDialog
        open={showWriteReview}
        onOpenChange={setShowWriteReview}
        venueId={venue?.id || ''}
        venueName={venue?.name || ''}
        onReviewSubmitted={fetchReviews}
      />
    </>
  );
}
