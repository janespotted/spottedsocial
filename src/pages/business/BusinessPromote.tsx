import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BusinessLayout } from '@/components/business/BusinessLayout';
import { VenueSelector } from '@/components/business/VenueSelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Trophy, MapPin, Sparkles, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Promotion {
  id: string;
  promotion_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
}

interface WaitlistSelection {
  type: 'leaderboard_boost' | 'map_highlight';
  title: string;
  billingPeriod: 'weekly' | 'monthly';
  price: number;
}

export default function BusinessPromote() {
  const { user } = useAuth();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSelection, setWaitlistSelection] = useState<WaitlistSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchPromotions() {
      if (!selectedVenueId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('venue_promotions')
          .select('*')
          .eq('venue_id', selectedVenueId)
          .in('status', ['active', 'pending']);

        if (error) throw error;
        setActivePromotions(data || []);
      } catch (err) {
        console.error('Error fetching promotions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchPromotions();
  }, [selectedVenueId]);

  const openWaitlist = (type: 'leaderboard_boost' | 'map_highlight', title: string, billingPeriod: 'weekly' | 'monthly', price: number) => {
    setWaitlistSelection({ type, title, billingPeriod, price });
    setWaitlistOpen(true);
  };

  const handleJoinWaitlist = async () => {
    if (!user || !selectedVenueId || !waitlistSelection) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('promotion_interest')
        .insert({
          venue_id: selectedVenueId,
          user_id: user.id,
          tier: waitlistSelection.type,
          billing_period: waitlistSelection.billingPeriod,
          price_shown: waitlistSelection.price,
        });

      if (error) {
        if (error.code === '23505') {
          toast.info("You're already on the list for this — we'll be in touch soon!");
        } else {
          throw error;
        }
      } else {
        toast.success("You're on the list! We'll reach out when promotions go live.");
      }
      setWaitlistOpen(false);
    } catch (err) {
      console.error('Error joining waitlist:', err);
      toast.error('Failed to join waitlist');
    } finally {
      setSubmitting(false);
    }
  };

  const promotionOptions = [
    {
      type: 'leaderboard_boost' as const,
      icon: Trophy,
      title: 'Leaderboard Boost',
      description: 'Get featured in the top promoted spots on the neighborhood leaderboard',
      weeklyPrice: 29,
      monthlyPrice: 79,
      benefits: [
        'Appear in top 2 promoted spots',
        'Highlighted with special badge',
        'Priority placement on busy nights',
      ],
    },
    {
      type: 'map_highlight' as const,
      icon: MapPin,
      title: 'Map Highlight',
      description: 'Your venue glows with a special marker on the map',
      weeklyPrice: 19,
      monthlyPrice: 49,
      benefits: [
        'Glowing venue marker',
        'Larger pin on the map',
        'Visible from further zoom levels',
      ],
    },
  ];

  const getActivePromotion = (type: string) => {
    return activePromotions.find(p => p.promotion_type === type && p.status === 'active');
  };

  return (
    <BusinessLayout title="Promote Your Venue">
      {/* Venue Selector */}
      <div className="mb-6">
        <VenueSelector
          selectedVenueId={selectedVenueId}
          onVenueChange={setSelectedVenueId}
        />
      </div>

      {selectedVenueId ? (
        <div className="space-y-4">
          {/* Active Promotions */}
          {activePromotions.length > 0 && (
            <Card className="bg-green-500/10 border-green-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-green-400 text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Active Promotions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activePromotions.map((promo) => (
                  <div
                    key={promo.id}
                    className="flex items-center justify-between p-2 rounded bg-white/5"
                  >
                    <div className="flex items-center gap-2">
                      {promo.promotion_type === 'leaderboard' ? (
                        <Trophy className="h-4 w-4 text-yellow-400" />
                      ) : (
                        <MapPin className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-white text-sm capitalize">
                        {promo.promotion_type} Boost
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-white/50" />
                      <span className="text-white/50 text-xs">
                        Ends {new Date(promo.ends_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Promotion Options */}
          {promotionOptions.map((option) => {
            const isActive = !!getActivePromotion(option.type);

            return (
              <Card
                key={option.type}
                className={`border ${
                  isActive
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <option.icon className="h-5 w-5 text-primary" />
                      {option.title}
                    </CardTitle>
                    {isActive && (
                      <Badge className="bg-green-500 text-white">Active</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-white/60 text-sm">{option.description}</p>

                  <ul className="space-y-2">
                    {option.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-center gap-2 text-white/80 text-sm">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {benefit}
                      </li>
                    ))}
                  </ul>

                  {!isActive && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button
                        onClick={() => openWaitlist(option.type, option.title, 'weekly', option.weeklyPrice)}
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        ${option.weeklyPrice}/week
                      </Button>
                      <Button
                        onClick={() => openWaitlist(option.type, option.title, 'monthly', option.monthlyPrice)}
                        className="bg-primary hover:bg-primary/80"
                      >
                        ${option.monthlyPrice}/month
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Contact Info */}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="py-4 text-center">
              <p className="text-white/60 text-sm">
                Questions about promotions?{' '}
                <a
                  href="mailto:business@spotted.social"
                  className="text-primary hover:underline"
                >
                  Contact us
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-12 text-center">
            <p className="text-white/60">Select a venue to manage promotions</p>
          </CardContent>
        </Card>
      )}

      {/* Waitlist Drawer */}
      <Drawer open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DrawerContent>
          <DrawerHeader className="text-center">
            <DrawerTitle>Join the Waitlist</DrawerTitle>
          </DrawerHeader>
          <div className="px-6 pb-2 text-center space-y-3">
            <p className="text-muted-foreground text-sm">
              We're launching promotions soon! Want to be first in line?
            </p>
            {waitlistSelection && (
              <div className="bg-muted rounded-lg p-4 space-y-1">
                <p className="font-semibold text-foreground">{waitlistSelection.title}</p>
                <p className="text-primary font-bold text-lg">
                  ${waitlistSelection.price}/{waitlistSelection.billingPeriod === 'weekly' ? 'week' : 'month'}
                </p>
              </div>
            )}
          </div>
          <DrawerFooter>
            <Button onClick={handleJoinWaitlist} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Join the waitlist
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </BusinessLayout>
  );
}
