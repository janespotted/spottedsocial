import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendsOutStatus } from '@/hooks/useFriendsOutStatus';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Search, X } from 'lucide-react';

export default function AllFriends() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openFriendCard } = useFriendIdCard();
  const demoEnabled = useDemoMode();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const { data: outStatus } = useFriendsOutStatus();
  const [search, setSearch] = useState('');

  const outMap = useMemo(() => {
    const m = new Map<string, string>();
    if (outStatus?.outFriends) {
      for (const f of outStatus.outFriends) {
        if (f.venue_name) m.set(f.user_id, f.venue_name);
      }
    }
    return m;
  }, [outStatus]);

  const friends = useMemo(() => {
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

    list.sort((a: any, b: any) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    );

    return list;
  }, [friendIds, allProfiles, demoEnabled, search]);

  const totalCount = useMemo(() => {
    if (!friendIds || !allProfiles) return 0;
    const idSet = new Set(friendIds);
    return allProfiles
      .filter((p: any) => idSet.has(p.id))
      .filter((p: any) => demoEnabled || !p.is_demo)
      .length;
  }, [friendIds, allProfiles, demoEnabled]);

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
        <div>
          <h1 className="text-white font-semibold text-lg">Friends</h1>
          <p className="text-white/40 text-xs">{totalCount} friend{totalCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="bg-[#2d1b4e]/80 border border-[#a855f7]/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search friends..."
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

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {friends.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">
              {search ? 'No friends found' : 'No friends yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {friends.map((friend: any) => {
              const venueName = outMap.get(friend.id);
              return (
                <button
                  key={friend.id}
                  onClick={() => openFriendCard({
                    userId: friend.id,
                    displayName: friend.display_name,
                    avatarUrl: friend.avatar_url,
                    venueName: venueName || undefined,
                  })}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                >
                  <Avatar className="w-9 h-9 border-2 border-[#a855f7]/40">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                      {friend.display_name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                    {venueName ? (
                      <p className="text-[#d4ff00] text-xs truncate">Out · {venueName}</p>
                    ) : (
                      <p className="text-white/40 text-xs truncate">@{friend.username}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
