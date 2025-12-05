import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportType: 'user' | 'post' | 'yap' | 'venue';
  targetId: string;
  targetName?: string;
}

const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
];

const VENUE_REPORT_REASONS = [
  { value: 'closed', label: 'Permanently closed' },
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'wrong_info', label: 'Incorrect information' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
];

export function ReportDialog({ open, onOpenChange, reportType, targetId, targetName }: ReportDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user || !reason) {
      toast.error('Please select a reason');
      return;
    }

    setLoading(true);
    try {
      const reportData: any = {
        reporter_id: user.id,
        reason,
        details: details || null,
      };

      if (reportType === 'user') {
        reportData.reported_user_id = targetId;
      } else if (reportType === 'post') {
        reportData.reported_post_id = targetId;
      } else if (reportType === 'yap') {
        reportData.reported_yap_id = targetId;
      } else if (reportType === 'venue') {
        reportData.reported_venue_id = targetId;
      }

      const { error } = await supabase
        .from('reports')
        .insert(reportData);

      if (error) throw error;

      toast.success('Report submitted. We\'ll review it shortly.');
      onOpenChange(false);
      setReason('');
      setDetails('');
    } catch (error: any) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (reportType) {
      case 'user':
        return `Report ${targetName || 'User'}`;
      case 'post':
        return 'Report Post';
      case 'yap':
        return 'Report Yap';
      case 'venue':
        return `Report ${targetName || 'Venue'}`;
      default:
        return 'Report';
    }
  };

  const reasons = reportType === 'venue' ? VENUE_REPORT_REASONS : REPORT_REASONS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%] max-w-[400px] bg-[#1a0f2e] border-[#a855f7]/40 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">{getTitle()}</DialogTitle>
          <DialogDescription className="text-white/60">
            Help us understand the issue. Your report is confidential.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={reason} onValueChange={setReason} className="space-y-3">
            {reasons.map((r) => (
              <div key={r.value} className="flex items-center space-x-3">
                <RadioGroupItem 
                  value={r.value} 
                  id={r.value}
                  className="border-[#a855f7]/40 text-[#a855f7]"
                />
                <Label 
                  htmlFor={r.value} 
                  className="text-white cursor-pointer"
                >
                  {r.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-2">
            <Label className="text-white/80 text-sm">Additional details (optional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide any additional context..."
              className="bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white min-h-[80px] resize-none"
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason || loading}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white"
          >
            {loading ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
