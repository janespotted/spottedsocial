import { useState, useEffect } from 'react';
import { Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReadReceiptsToggleProps {
  userId: string | undefined;
}

export function ReadReceiptsToggle({ userId }: ReadReceiptsToggleProps) {
  const [enabled, setEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('show_read_receipts')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setEnabled(data.show_read_receipts);
        setIsLoading(false);
      });
  }, [userId]);

  const handleToggle = async (value: boolean) => {
    if (!userId) return;
    setEnabled(value);
    const { error } = await supabase
      .from('profiles')
      .update({ show_read_receipts: value })
      .eq('id', userId);
    if (error) {
      setEnabled(!value);
      toast.error('Failed to update setting');
    }
  };

  return (
    <Card className="bg-[#2d1b4e]/60 border-[#a855f7]/20">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#a855f7]/20 flex items-center justify-center">
            <Eye className="h-5 w-5 text-[#a855f7]" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-white">Read Receipts</h3>
            <p className="text-white/60 text-sm">Let friends see when you've read messages</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>
    </Card>
  );
}
