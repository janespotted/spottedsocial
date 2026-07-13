import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft, EyeOff, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useProfilesSafe } from '@/hooks/useProfilesCache';

interface HiddenRow {
  id: string;
  hidden_from_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface BlockedRow {
  id: string;
  blocked_id: string;
  display_name: string;
  avatar_url: string | null;
}

export default function BlockedHidden() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: allProfiles } = useProfilesSafe();
  const [hiddenList, setHiddenList] = useState<HiddenRow[]>([]);
  const [blockedList, setBlockedList] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [hiddenRes, blockedRes] = await Promise.all([
      supabase
        .from('location_hidden')
        .select('id, hidden_from_id')
        .eq('user_id', user.id),
      supabase
        .from('blocked_users')
        .select('id, blocked_id')
        .eq('blocker_id', user.id),
    ]);

    const profileMap = new Map(
      (allProfiles || []).map((p: any) => [p.id, p])
    );

    const hidden: HiddenRow[] = (hiddenRes.data || []).map((row: any) => {
      const prof = profileMap.get(row.hidden_from_id);
      return {
        id: row.id,
        hidden_from_id: row.hidden_from_id,
        display_name: prof?.display_name || 'Unknown',
        avatar_url: prof?.avatar_url || null,
      };
    });

    const blocked: BlockedRow[] = (blockedRes.data || []).map((row: any) => {
      const prof = profileMap.get(row.blocked_id);
      return {
        id: row.id,
        blocked_id: row.blocked_id,
        display_name: prof?.display_name || 'Unknown',
        avatar_url: prof?.avatar_url || null,
      };
    });

    setHiddenList(hidden);
    setBlockedList(blocked);
    setLoading(false);
  };

  const handleUnhide = async (row: HiddenRow) => {
    // Optimistic removal
    setHiddenList(prev => prev.filter(r => r.id !== row.id));

    const { error } = await supabase
      .from('location_hidden')
      .delete()
      .eq('id', row.id);

    if (error) {
      setHiddenList(prev => [...prev, row]);
      toast.error('Failed to unhide');
      return;
    }
    toast.success(`${row.display_name} can see your location again`);
  };

  const handleUnblock = async (row: BlockedRow) => {
    // Optimistic removal
    setBlockedList(prev => prev.filter(r => r.id !== row.id));

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('id', row.id);

    if (error) {
      setBlockedList(prev => [...prev, row]);
      toast.error('Failed to unblock');
      return;
    }
    toast.success(`${row.display_name} unblocked`);
  };

  return (
    <div className="h-[100dvh] bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate('/settings')}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold text-white">Blocked & Hidden</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
        {loading ? (
          <div className="text-center text-white/60 py-8">Loading...</div>
        ) : (
          <>
            {/* Hidden From section */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <EyeOff className="w-4 h-4 text-amber-400" />
                <h2 className="text-white font-semibold text-sm">Hidden From</h2>
                <span className="text-white/40 text-xs">({hiddenList.length})</span>
              </div>
              <p className="text-white/30 text-xs mb-3">
                These people can't see your location on the map. They're still your friends and aren't notified.
              </p>
              {hiddenList.length === 0 ? (
                <div className="bg-white/[0.04] rounded-2xl p-6 text-center">
                  <EyeOff className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-white/40 text-sm">No one hidden</p>
                  <p className="text-white/20 text-xs mt-1">Use the ⋯ menu on a friend's card to hide your location from them</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {hiddenList.map(row => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={row.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                            {row.display_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-white text-sm font-medium truncate">{row.display_name}</p>
                      </div>
                      <button
                        onClick={() => handleUnhide(row)}
                        className="px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/10 transition-colors flex-shrink-0"
                      >
                        Unhide
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Blocked section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-4 h-4 text-red-400" />
                <h2 className="text-white font-semibold text-sm">Blocked</h2>
                <span className="text-white/40 text-xs">({blockedList.length})</span>
              </div>
              <p className="text-white/30 text-xs mb-3">
                Blocked people can't see you on the map, message you, or send friend requests. Unblocking does not restore friendship.
              </p>
              {blockedList.length === 0 ? (
                <div className="bg-white/[0.04] rounded-2xl p-6 text-center">
                  <Ban className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-white/40 text-sm">No one blocked</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedList.map(row => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={row.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#1a0f2e] text-white text-sm">
                            {row.display_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-white text-sm font-medium truncate">{row.display_name}</p>
                      </div>
                      <button
                        onClick={() => handleUnblock(row)}
                        className="px-3 py-1.5 rounded-full border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors flex-shrink-0"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
