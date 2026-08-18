import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendsOutStatus } from '@/hooks/useFriendsOutStatus';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Search, X, Heart, ChevronRight, MapPin, Target } from 'lucide-react';
import spottedLogo from '@/assets/spotted-s-logo.png';

export default function AllFriends() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const { data: outStatus } = useFriendsOutStatus();
  const [search, setSearch] = useState('');

  // Build sets for out/planning user IDs and venue map
  const { outSet, planningSet, outVenueMap, planningNeighborhoodMap, planningVenueNameMap } = useMemo(() => {
    const os = new Set<string>();
    const ps = new Set<string>();
    const ovm = new Map<string, string>();
    const pnm = new Map<string, string | null>();
    const pvnm = new Map<string, string | null>();
    if (outStatus?.outFriends) {
      for (const f of outStatus.outFriends) {
        os.add(f.user_id);
        if (f.venue_name) ovm.set(f.user_id, f.venue_name);
      }
    }
    if (outStatus?.planningFriends) {
      for (const f of outStatus.planningFriends) {
        ps.add(f.user_id);
        pnm.set(f.user_id, f.planning_neighborhood);
        pvnm.set(f.user_id, f.planning_venue_name);
      }
    }
    return { outSet: os, planningSet: ps, outVenueMap: ovm, planningNeighborhoodMap: pnm, planningVenueNameMap: pvnm };
  }, [outStatus]);

  // All friends filtered by search + demo
  const allFriendProfiles = useMemo(() => {
    if (!friendIds || !allProfiles) return [];
    const idSet = new Set(friendIds);
    let list = allProfiles
      .filter((p: any) => idSet.has(p.id))
      .filter((p: any) => demoEnabled || !p.is_demo);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p: any) =>
        p.display_name?.toLowerCase().includes(q) ||
        p.username?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [friendIds, allProfiles, demoEnabled, search]);

  // Split into sections
  const outNowFriends = useMemo(() =>
    allFriendProfiles
      .filter((p: any) => outSet.has(p.id))
      .sort((a: any, b: any) => (a.display_name || '').localeCompare(b.display_name || '')),
    [allFriendProfiles, outSet]);

  const tbdFriends = useMemo(() =>
    allFriendProfiles
      .filter((p: any) => planningSet.has(p.id) && !outSet.has(p.id))
      .sort((a: any, b: any) => (a.display_name || '').localeCompare(b.display_name || '')),
    [allFriendProfiles, planningSet, outSet]);

  const restFriends = useMemo(() =>
    allFriendProfiles
      .filter((p: any) => !outSet.has(p.id) && !planningSet.has(p.id))
      .sort((a: any, b: any) => (a.display_name || '').localeCompare(b.display_name || '')),
    [allFriendProfiles, outSet, planningSet]);

  const totalCount = useMemo(() => {
    if (!friendIds || !allProfiles) return 0;
    const idSet = new Set(friendIds);
    return allProfiles
      .filter((p: any) => idSet.has(p.id))
      .filter((p: any) => demoEnabled || !p.is_demo)
      .length;
  }, [friendIds, allProfiles, demoEnabled]);

  const hasResults = outNowFriends.length > 0 || tbdFriends.length > 0 || restFriends.length > 0;

  const handleTap = (friend: any) => {
    openFriendCard({
      userId: friend.id,
      displayName: friend.display_name,
      avatarUrl: friend.avatar_url,
      venueName: outVenueMap.get(friend.id) || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-[#110a24] z-[200] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-semibold text-lg">Friends</h1>
          <p className="text-white/40 text-xs">{totalCount} friend{totalCount !== 1 ? 's' : ''}</p>
        </div>
        <img src={spottedLogo} alt="Spotted" className="h-7 w-7 object-contain" />
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="bg-[#2d1b4e]/80 border border-[#a855f7]/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search by name or username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-white text-sm flex-1 outline-none placeholder:text-white/40"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Close Friends row */}
        {!search && (
          <button
            onClick={() => navigate('/profile/close-friends')}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#2d1b4e]/40 border border-[#a855f7]/20 hover:border-[#a855f7]/40 transition-colors mb-4"
          >
            <div className="w-9 h-9 rounded-full bg-[#d4ff00]/10 flex items-center justify-center">
              <Heart className="h-4 w-4 text-[#d4ff00]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white text-sm font-medium">Close Friends</p>
              <p className="text-white/30 text-xs">Manage your close friends list</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/20" />
          </button>
        )}

        {!hasResults ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">
              {search ? 'No friends found' : 'No friends yet'}
            </p>
          </div>
        ) : (
          <>
            {/* OUT NOW */}
            {outNowFriends.length > 0 && (
              <div className="mb-5">
                <h3 className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
                  Out Now ({outNowFriends.length})
                </h3>
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  {outNowFriends.map((friend: any, i: number) => (
                    <button
                      key={friend.id}
                      onClick={() => handleTap(friend)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#a855f7]/10 transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
                    >
                      <Avatar className="w-10 h-10 border-2 border-[#d4ff00]/30">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#d4ff00]/10 text-white text-xs">
                          {friend.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                        <p className="text-white/40 text-xs truncate">@{friend.username}</p>
                      </div>
                      <span className="flex items-center gap-1 text-[#d4ff00] text-xs font-medium flex-shrink-0">
                        <MapPin className="w-3 h-3" />
                        Out
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TBD */}
            {tbdFriends.length > 0 && (
              <div className="mb-5">
                <h3 className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
                  TBD ({tbdFriends.length})
                </h3>
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  {tbdFriends.map((friend: any, i: number) => (
                    <button
                      key={friend.id}
                      onClick={() => handleTap(friend)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#a855f7]/10 transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
                    >
                      <Avatar className="w-10 h-10 border-2 border-[#a855f7]/30">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#a855f7]/10 text-white text-xs">
                          {friend.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                        <p className="text-white/40 text-xs truncate">@{friend.username}</p>
                      </div>
                      <span className="flex items-center gap-1 text-[#a855f7] text-xs font-medium flex-shrink-0">
                        <Target className="w-3 h-3" />
                        Planning
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ALL FRIENDS (everyone not in out/TBD) */}
            {restFriends.length > 0 && (
              <div className="mb-5">
                <h3 className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
                  All Friends ({restFriends.length})
                </h3>
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  {restFriends.map((friend: any, i: number) => (
                    <button
                      key={friend.id}
                      onClick={() => handleTap(friend)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#a855f7]/10 transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
                    >
                      <Avatar className="w-10 h-10 border-2 border-white/10">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-white/5 text-white text-xs">
                          {friend.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                        <p className="text-white/40 text-xs truncate">@{friend.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
