import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MapPin, Check, X, Clock, Plus, AlertTriangle, Zap, RotateCcw } from 'lucide-react';

interface VenueReport {
  id: string;
  venue_id: string | null;
  user_id: string | null;
  report_type: string;
  reported_lat: number;
  reported_lng: number;
  user_lat: number;
  user_lng: number;
  suggested_venue_name: string | null;
  suggested_venue_type: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  auto_correction_id: string | null;
  auto_corrected_at: string | null;
  venue?: {
    name: string;
    neighborhood: string;
  };
}

interface AutoCorrection {
  id: string;
  venue_id: string;
  old_lat: number;
  old_lng: number;
  new_lat: number;
  new_lng: number;
  report_count: number;
  unique_user_count: number;
  reverted_at: string | null;
  reverted_by: string | null;
  created_at: string;
  venue?: {
    name: string;
    neighborhood: string;
  };
}

export function VenueReportsPanel() {
  const [reports, setReports] = useState<VenueReport[]>([]);
  const [autoCorrections, setAutoCorrections] = useState<AutoCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [activeTab, setActiveTab] = useState<'reports' | 'auto'>('reports');

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
    } else {
      fetchAutoCorrections();
    }
  }, [filter, activeTab]);

  const fetchAutoCorrections = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('venue_auto_corrections')
        .select(`
          *,
          venue:venue_id (name, neighborhood)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAutoCorrections((data as unknown as AutoCorrection[]) || []);
    } catch (error) {
      console.error('Error fetching auto corrections:', error);
      toast.error('Failed to load auto corrections');
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('venue_location_reports')
        .select(`
          *,
          venue:venue_id (name, neighborhood)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      }

      const { data, error } = await query;

      if (error) throw error;
      setReports((data as unknown as VenueReport[]) || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (report: VenueReport) => {
    try {
      if (report.report_type === 'new_venue' && report.suggested_venue_name) {
        // Create new venue
        const { error: venueError } = await supabase.from('venues').insert([{
          name: report.suggested_venue_name,
          lat: report.reported_lat,
          lng: report.reported_lng,
          neighborhood: 'TBD', // Would need to detect
          type: report.suggested_venue_type || 'bar',
          city: 'nyc', // Would need to detect
          is_user_submitted: true,
        }]);

        if (venueError) throw venueError;
      } else if (report.venue_id && report.report_type === 'wrong_location') {
        // Update venue coordinates
        const { error: updateError } = await supabase
          .from('venues')
          .update({
            lat: report.reported_lat,
            lng: report.reported_lng,
          })
          .eq('id', report.venue_id);

        if (updateError) throw updateError;
      }

      // Mark report as approved
      await supabase
        .from('venue_location_reports')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', report.id);

      toast.success('Report approved');
      fetchReports();
    } catch (error) {
      console.error('Error approving report:', error);
      toast.error('Failed to approve report');
    }
  };

  const handleReject = async (reportId: string) => {
    try {
      await supabase
        .from('venue_location_reports')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', reportId);

      toast.success('Report rejected');
      fetchReports();
    } catch (error) {
      console.error('Error rejecting report:', error);
      toast.error('Failed to reject report');
    }
  };

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case 'new_venue':
        return <Plus className="h-4 w-4 text-green-400" />;
      case 'wrong_location':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'correction':
        return <MapPin className="h-4 w-4 text-blue-400" />;
      default:
        return <MapPin className="h-4 w-4 text-white/50" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-yellow-400/40 text-yellow-400"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="border-green-400/40 text-green-400"><Check className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="border-red-400/40 text-red-400"><X className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'auto_corrected':
        return <Badge variant="outline" className="border-purple-400/40 text-purple-400"><Zap className="h-3 w-3 mr-1" />Auto</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleRevertAutoCorrection = async (correction: AutoCorrection) => {
    try {
      // Revert venue coordinates to old values
      const { error: updateError } = await supabase
        .from('venues')
        .update({
          lat: correction.old_lat,
          lng: correction.old_lng,
        })
        .eq('id', correction.venue_id);

      if (updateError) throw updateError;

      // Mark auto correction as reverted
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('venue_auto_corrections')
        .update({ 
          reverted_at: new Date().toISOString(),
          reverted_by: user?.id 
        })
        .eq('id', correction.id);

      // Reset related reports back to pending
      await supabase
        .from('venue_location_reports')
        .update({ status: 'pending', auto_correction_id: null, auto_corrected_at: null })
        .eq('auto_correction_id', correction.id);

      toast.success('Auto-correction reverted');
      fetchAutoCorrections();
    } catch (error) {
      console.error('Error reverting correction:', error);
      toast.error('Failed to revert correction');
    }
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#a855f7]" />
          Venue Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'reports' | 'auto')}>
          <TabsList className="w-full mb-4 bg-white/5">
            <TabsTrigger value="reports" className="flex-1 data-[state=active]:bg-[#a855f7]">
              Reports ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="auto" className="flex-1 data-[state=active]:bg-[#a855f7]">
              <Zap className="h-3 w-3 mr-1" />
              Auto ({autoCorrections.filter(c => !c.reverted_at).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports">
            <div className="flex gap-2 mb-4">
              <Button
                size="sm"
                variant={filter === 'pending' ? 'default' : 'outline'}
                onClick={() => setFilter('pending')}
                className={filter === 'pending' ? 'bg-[#a855f7]' : 'border-white/20 text-white'}
              >
                Pending
              </Button>
              <Button
                size="sm"
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
                className={filter === 'all' ? 'bg-[#a855f7]' : 'border-white/20 text-white'}
              >
                All
              </Button>
            </div>

            {loading ? (
              <div className="text-white/50 text-sm">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="text-white/50 text-sm text-center py-4">
                No {filter === 'pending' ? 'pending ' : ''}reports
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getReportTypeIcon(report.report_type)}
                        <span className="text-white font-medium capitalize">
                          {report.report_type.replace('_', ' ')}
                        </span>
                      </div>
                      {getStatusBadge(report.status)}
                    </div>

                    {report.report_type === 'new_venue' && report.suggested_venue_name && (
                      <div className="mb-2">
                        <p className="text-white">{report.suggested_venue_name}</p>
                        <p className="text-white/50 text-sm">
                          Type: {report.suggested_venue_type || 'bar'}
                        </p>
                      </div>
                    )}

                    {report.venue && (
                      <div className="mb-2">
                        <p className="text-white">{report.venue.name}</p>
                        <p className="text-white/50 text-sm">{report.venue.neighborhood}</p>
                      </div>
                    )}

                    <p className="text-white/40 text-xs mb-2">
                      Reported: {report.reported_lat.toFixed(6)}, {report.reported_lng.toFixed(6)}
                    </p>

                    {report.notes && (
                      <p className="text-white/60 text-sm italic mb-2">"{report.notes}"</p>
                    )}

                    <p className="text-white/30 text-xs">
                      {new Date(report.created_at).toLocaleDateString()}
                    </p>

                    {report.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(report)}
                          className="flex-1 bg-green-600 hover:bg-green-500"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(report.id)}
                          className="flex-1"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="auto">
            {loading ? (
              <div className="text-white/50 text-sm">Loading auto corrections...</div>
            ) : autoCorrections.length === 0 ? (
              <div className="text-white/50 text-sm text-center py-4">
                No auto corrections yet
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {autoCorrections.map((correction) => (
                  <div
                    key={correction.id}
                    className={`p-4 rounded-xl border ${
                      correction.reverted_at 
                        ? 'bg-red-500/5 border-red-400/20' 
                        : 'bg-purple-500/10 border-purple-400/20'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-purple-400" />
                        <span className="text-white font-medium">
                          {correction.venue?.name || 'Unknown Venue'}
                        </span>
                      </div>
                      {correction.reverted_at ? (
                        <Badge variant="outline" className="border-red-400/40 text-red-400">
                          <RotateCcw className="h-3 w-3 mr-1" />Reverted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-purple-400/40 text-purple-400">
                          <Check className="h-3 w-3 mr-1" />Active
                        </Badge>
                      )}
                    </div>

                    {correction.venue?.neighborhood && (
                      <p className="text-white/50 text-sm mb-2">{correction.venue.neighborhood}</p>
                    )}

                    <div className="text-white/40 text-xs space-y-1 mb-2">
                      <p>Old: {correction.old_lat.toFixed(6)}, {correction.old_lng.toFixed(6)}</p>
                      <p>New: {correction.new_lat.toFixed(6)}, {correction.new_lng.toFixed(6)}</p>
                    </div>

                    <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                      <span>{correction.report_count} reports</span>
                      <span>•</span>
                      <span>{correction.unique_user_count} users</span>
                    </div>

                    <p className="text-white/30 text-xs">
                      {new Date(correction.created_at).toLocaleDateString()}
                    </p>

                    {!correction.reverted_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevertAutoCorrection(correction)}
                        className="mt-3 w-full border-red-400/40 text-red-400 hover:bg-red-400/10"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Revert to Original
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
