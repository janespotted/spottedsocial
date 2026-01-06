import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Check, X, AlertTriangle, Target } from 'lucide-react';

interface AnalyticsSummary {
  totalDetections: number;
  confirmations: number;
  corrections: number;
  dismissals: number;
  errors: number;
  accuracyRate: number;
}

export function DetectionAnalyticsPanel() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Get counts by event type for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('location_detection_logs')
        .select('event_type, was_correct')
        .gte('created_at', sevenDaysAgo.toISOString());

      if (error) throw error;

      const logs = data || [];
      
      const detections = logs.filter(l => l.event_type === 'detection').length;
      const confirmations = logs.filter(l => l.event_type === 'confirmation').length;
      const corrections = logs.filter(l => l.event_type === 'correction').length;
      const dismissals = logs.filter(l => l.event_type === 'dismissal').length;
      const errors = logs.filter(l => l.event_type === 'error').length;

      const correctConfirmations = logs.filter(
        l => l.event_type === 'confirmation' && l.was_correct === true
      ).length;

      const accuracyRate = confirmations > 0 
        ? Math.round((correctConfirmations / confirmations) * 100) 
        : 0;

      setSummary({
        totalDetections: detections,
        confirmations,
        corrections,
        dismissals,
        errors,
        accuracyRate,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardContent className="py-8">
          <div className="text-white/50 text-sm text-center">Loading analytics...</div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#a855f7]" />
          Detection Analytics (Last 7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {/* Accuracy Rate */}
          <div className="col-span-2 p-4 rounded-xl bg-gradient-to-r from-[#a855f7]/20 to-[#9333ea]/20 border border-[#a855f7]/30">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-5 w-5 text-[#a855f7]" />
              <span className="text-white/60 text-sm">Detection Accuracy</span>
            </div>
            <p className="text-3xl font-bold text-white">{summary.accuracyRate}%</p>
          </div>

          {/* Detections */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-blue-400" />
              <span className="text-white/60 text-xs">Detections</span>
            </div>
            <p className="text-xl font-semibold text-white">{summary.totalDetections}</p>
          </div>

          {/* Confirmations */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <Check className="h-4 w-4 text-green-400" />
              <span className="text-white/60 text-xs">Confirmed</span>
            </div>
            <p className="text-xl font-semibold text-white">{summary.confirmations}</p>
          </div>

          {/* Corrections */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-white/60 text-xs">Corrections</span>
            </div>
            <p className="text-xl font-semibold text-white">{summary.corrections}</p>
          </div>

          {/* Errors */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <X className="h-4 w-4 text-red-400" />
              <span className="text-white/60 text-xs">Errors</span>
            </div>
            <p className="text-xl font-semibold text-white">{summary.errors}</p>
          </div>
        </div>

        <p className="text-white/30 text-xs mt-3 text-center">
          Dismissals: {summary.dismissals}
        </p>
      </CardContent>
    </Card>
  );
}
