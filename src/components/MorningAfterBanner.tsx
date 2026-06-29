import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCity } from '@/hooks/useUserCity';
import { isMorningAfterTime, getMorningAfterWindow } from '@/lib/morning-after';

interface MorningAfterBannerProps {
  onOpen: () => void;
}

export function MorningAfterBanner({ onOpen }: MorningAfterBannerProps) {
  const { user } = useAuth();
  const { city } = useUserCity();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || dismissed) return;

    // Check if we're in the morning-after time window
    if (!isMorningAfterTime(city)) return;

    // Check if already dismissed this session
    const sessionKey = `morning_after_dismissed_${new Date().toDateString()}`;
    if (sessionStorage.getItem(sessionKey)) {
      setDismissed(true);
      return;
    }

    // Check if user has any data from last night
    checkLastNightActivity();
  }, [user, city, dismissed]);

  const checkLastNightActivity = async () => {
    if (!user) return;
    const window = getMorningAfterWindow(city);

    // Quick check: any check-ins last night?
    const { data: checkins } = await supabase
      .from('checkins')
      .select('id')
      .eq('user_id', user.id)
      .gte('started_at', window.start)
      .lt('started_at', window.end)
      .eq('is_demo', false)
      .limit(1);

    if (checkins && checkins.length > 0) {
      setVisible(true);
      return;
    }

    // Check if user posted last night
    const { data: posts } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', window.start)
      .lt('created_at', window.end)
      .eq('is_demo', false)
      .limit(1);

    if (posts && posts.length > 0) {
      setVisible(true);
      return;
    }

    // Check if any friends were out (for stayed-in users)
    const [sent, received] = await Promise.all([
      supabase.from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'accepted'),
      supabase.from('friendships').select('user_id').eq('friend_id', user.id).eq('status', 'accepted'),
    ]);
    const friendIds = [
      ...(sent.data?.map(f => f.friend_id) || []),
      ...(received.data?.map(f => f.user_id) || []),
    ];

    if (friendIds.length > 0) {
      const { data: friendCheckins } = await supabase
        .from('checkins')
        .select('id')
        .in('user_id', friendIds)
        .gte('started_at', window.start)
        .lt('started_at', window.end)
        .eq('is_demo', false)
        .limit(1);

      if (friendCheckins && friendCheckins.length > 0) {
        setVisible(true);
      }
    }
  };

  if (!visible || dismissed) return null;

  const handleDismiss = () => {
    const sessionKey = `morning_after_dismissed_${new Date().toDateString()}`;
    sessionStorage.setItem(sessionKey, 'true');
    setDismissed(true);
  };

  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center justify-between px-4 py-3 bg-[#1F1740] border-b border-white/8"
    >
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[#d4ff00]" />
        <span className="text-sm font-medium text-white">last night's recap</span>
      </div>
      <ChevronRight className="w-4 h-4 text-white/40" />
    </button>
  );
}
