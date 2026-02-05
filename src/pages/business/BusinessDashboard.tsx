import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BusinessLayout } from '@/components/business/BusinessLayout';
import { VenueSelector } from '@/components/business/VenueSelector';
import { BusinessOnboarding } from '@/components/business/BusinessOnboarding';
import { CheckInTrendChart } from '@/components/business/CheckInTrendChart';
import { HourlyDistributionChart } from '@/components/business/HourlyDistributionChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, MessageSquare, TrendingUp, TrendingDown, Clock, Users, Calendar, MapPin } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';

interface EnhancedAnalytics {
  today: number;
  week: number;
  month: number;
  peakHour: number | null;
  weekChange: number;
  yesterday: number;
  yesterdayChange: number;
  busiestDay: string | null;
  avgPerDay: number;
  dailyTrend: { date: string; count: number; label: string }[];
  hourlyDistribution: { hour: number; count: number; label: string }[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<EnhancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check onboarding status
  useEffect(() => {
    const hasCompletedOnboarding = localStorage.getItem('business_onboarding_complete');
    if (!hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!selectedVenueId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const today = startOfDay(new Date());
        const yesterday = subDays(today, 1);
        const weekAgo = subDays(today, 7);
        const monthAgo = subDays(today, 30);
        const twoWeeksAgo = subDays(today, 14);

        const { data: checkins, error } = await supabase
          .from('checkins')
          .select('created_at')
          .eq('venue_id', selectedVenueId)
          .gte('created_at', monthAgo.toISOString());

        if (error) throw error;

        const allCheckins = checkins || [];

        const todayCount = allCheckins.filter(c => 
          new Date(c.created_at!) >= today
        ).length;

        const yesterdayCount = allCheckins.filter(c => {
          const date = new Date(c.created_at!);
          return date >= yesterday && date < today;
        }).length;

        const weekCount = allCheckins.filter(c => 
          new Date(c.created_at!) >= weekAgo
        ).length;

        const monthCount = allCheckins.length;

        const prevWeekCount = allCheckins.filter(c => {
          const date = new Date(c.created_at!);
          return date >= twoWeeksAgo && date < weekAgo;
        }).length;

        const weekChange = prevWeekCount > 0 
          ? Math.round(((weekCount - prevWeekCount) / prevWeekCount) * 100)
          : weekCount > 0 ? 100 : 0;

        const yesterdayChange = yesterdayCount > 0 
          ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
          : todayCount > 0 ? 100 : 0;

        const avgPerDay = Math.round((monthCount / 30) * 10) / 10;

        const hourCounts: { [hour: number]: number } = {};
        allCheckins
          .filter(c => new Date(c.created_at!) >= weekAgo)
          .forEach(c => {
            const hour = new Date(c.created_at!).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          });

        let peakHour: number | null = null;
        let maxCount = 0;
        Object.entries(hourCounts).forEach(([hour, count]) => {
          if (count > maxCount) {
            maxCount = count;
            peakHour = parseInt(hour);
          }
        });

        const dayCounts: { [day: number]: number } = {};
        allCheckins.forEach(c => {
          const day = new Date(c.created_at!).getDay();
          dayCounts[day] = (dayCounts[day] || 0) + 1;
        });

        let busiestDay: string | null = null;
        let maxDayCount = 0;
        Object.entries(dayCounts).forEach(([day, count]) => {
          if (count > maxDayCount) {
            maxDayCount = count;
            busiestDay = DAY_NAMES[parseInt(day)];
          }
        });

        const dailyTrend: { date: string; count: number; label: string }[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = subDays(today, i);
          const nextDate = subDays(today, i - 1);
          const count = allCheckins.filter(c => {
            const d = new Date(c.created_at!);
            return d >= date && d < nextDate;
          }).length;
          dailyTrend.push({
            date: format(date, 'yyyy-MM-dd'),
            count,
            label: format(date, 'EEE'),
          });
        }

        const nightlifeHours = [18, 19, 20, 21, 22, 23, 0, 1, 2];
        const hourlyDistribution = nightlifeHours.map(hour => ({
          hour,
          count: hourCounts[hour] || 0,
          label: hour === 0 ? '12A' : hour < 12 ? `${hour}A` : hour === 12 ? '12P' : `${hour - 12}P`,
        }));

        setAnalytics({
          today: todayCount,
          week: weekCount,
          month: monthCount,
          peakHour,
          weekChange,
          yesterday: yesterdayCount,
          yesterdayChange,
          busiestDay,
          avgPerDay,
          dailyTrend,
          hourlyDistribution,
        });
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [selectedVenueId]);

  const formatHour = (hour: number | null) => {
    if (hour === null) return 'No data';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h} ${ampm}`;
  };

  if (showOnboarding) {
    return (
      <BusinessOnboarding 
        onComplete={() => setShowOnboarding(false)}
        venueName={selectedVenueName ?? undefined}
      />
    );
  }

  return (
    <BusinessLayout title="Dashboard" showBack={false}>
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
          {selectedVenueName && (
            <div className="mb-2">
              <h2 className="text-white text-lg font-semibold">
                Welcome back, {selectedVenueName}
              </h2>
              <p className="text-white/50 text-sm">
                {loading ? 'Loading analytics...' : 'Here\'s how you\'re doing'}
              </p>
            </div>
          )}

          <CheckInTrendChart 
            data={analytics?.dailyTrend ?? []} 
            loading={loading} 
          />

          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-white/5 border-white/10 p-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {loading ? '-' : analytics?.today ?? 0}
                </div>
                <div className="text-white/50 text-xs">Today</div>
                {!loading && analytics && (
                  <div className={`text-xs mt-1 flex items-center justify-center gap-0.5 ${
                    analytics.yesterdayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {analytics.yesterdayChange >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {analytics.yesterdayChange >= 0 ? '+' : ''}{analytics.yesterdayChange}%
                  </div>
                )}
              </div>
            </Card>

            <Card className="bg-white/5 border-white/10 p-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {loading ? '-' : analytics?.week ?? 0}
                </div>
                <div className="text-white/50 text-xs">7 Days</div>
                {!loading && analytics && (
                  <div className={`text-xs mt-1 flex items-center justify-center gap-0.5 ${
                    analytics.weekChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {analytics.weekChange >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {analytics.weekChange >= 0 ? '+' : ''}{analytics.weekChange}%
                  </div>
                )}
              </div>
            </Card>

            <Card className="bg-white/5 border-white/10 p-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {loading ? '-' : analytics?.month ?? 0}
                </div>
                <div className="text-white/50 text-xs">30 Days</div>
                {!loading && analytics && (
                  <div className="text-xs mt-1 text-white/40">
                    ~{analytics.avgPerDay}/day
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Card className="bg-white/5 border-white/10 p-3">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                <Clock className="h-3 w-3" />
                Peak Hour
              </div>
              <div className="text-white font-semibold text-sm">
                {loading ? (
                  <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
                ) : analytics?.peakHour !== null ? (
                  formatHour(analytics?.peakHour ?? null)
                ) : (
                  'No data yet'
                )}
              </div>
            </Card>

            <Card className="bg-white/5 border-white/10 p-3">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                <Calendar className="h-3 w-3" />
                Busiest Day
              </div>
              <div className="text-white font-semibold text-sm">
                {loading ? (
                  <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
                ) : analytics?.busiestDay ? (
                  analytics.busiestDay
                ) : (
                  'No data yet'
                )}
              </div>
            </Card>
          </div>

          <HourlyDistributionChart 
            data={analytics?.hourlyDistribution ?? []} 
            peakHour={analytics?.peakHour ?? null}
            loading={loading} 
          />

          {!loading && analytics && analytics.week > 0 && (
            <Card className={`border-0 ${
              analytics.weekChange >= 0 
                ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5' 
                : 'bg-gradient-to-r from-rose-500/20 to-rose-500/5'
            }`}>
              <CardContent className="p-3 flex items-center gap-3">
                {analytics.weekChange >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-rose-400" />
                )}
                <div>
                  <p className="text-white text-sm font-medium">
                    {analytics.weekChange >= 0 ? 'Up' : 'Down'} {Math.abs(analytics.weekChange)}% vs last week
                  </p>
                  <p className="text-white/50 text-xs">
                    {analytics.week} check-ins this week
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => navigate('/business/promote')}
                variant="outline"
                className="h-auto py-3 flex-col gap-1.5 border-white/20 text-white hover:bg-white/10"
              >
                <Megaphone className="h-4 w-4 text-primary" />
                <span className="text-xs">Promote</span>
              </Button>
              <Button
                onClick={() => navigate('/business/yap')}
                variant="outline"
                className="h-auto py-3 flex-col gap-1.5 border-white/20 text-white hover:bg-white/10"
              >
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-xs">Yap</span>
              </Button>
              <Button
                onClick={() => navigate('/map')}
                variant="outline"
                className="h-auto py-3 flex-col gap-1.5 border-white/20 text-white hover:bg-white/10"
              >
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-xs">View Map</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2">
              No venues found
            </p>
            <p className="text-white/40 text-sm mb-4">
              Your claim may still be pending review
            </p>
            <Button
              onClick={() => navigate('/business/auth')}
              className="bg-primary hover:bg-primary/80"
            >
              Claim a Venue
            </Button>
          </CardContent>
        </Card>
      )}
    </BusinessLayout>
  );
}