import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFriendsOutStatus, FriendOutStatus, FriendRing } from '@/hooks/useFriendsOutStatus';

const RING_LABELS: Record<FriendRing, string> = {
  close: 'Close Friends',
  friend: 'Friends',
  mutual: 'Mutual Friends',
};

const RING_ORDER: FriendRing[] = ['close', 'friend', 'mutual'];

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Simple Euclidean approximation — fine for sorting within a city
  const dlat = lat1 - lat2;
  const dlng = (lng1 - lng2) * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function sortByProximity(friends: FriendOutStatus[], userLat: number | null, userLng: number | null): FriendOutStatus[] {
  if (userLat == null || userLng == null) {
    return friends.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
  return friends.sort((a, b) => {
    const distA = a.lat != null && a.lng != null ? getDistance(userLat, userLng, a.lat, a.lng) : Infinity;
    const distB = b.lat != null && b.lng != null ? getDistance(userLat, userLng, b.lat, b.lng) : Infinity;
    return distA - distB;
  });
}

function FriendRow({ friend, onTap }: { friend: FriendOutStatus; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
    >
      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={friend.avatar_url || undefined} />
        <AvatarFallback className="bg-[#1a0a2e] text-white text-xs">
          {friend.display_name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
        <p className={`text-xs truncate ${friend.status === 'out' ? 'text-[#d4ff00]' : 'text-white/40'}`}>
          {friend.status === 'out'
            ? friend.venue_name ? `At ${friend.venue_name}` : 'Out'
            : friend.planning_venue_name
              ? `thinking ${friend.planning_venue_name}`
              : `TBD${friend.planning_neighborhood ? ` · ${friend.planning_neighborhood}` : ' · down for anything'}`}
        </p>
      </div>
    </button>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 py-1.5 bg-white/[0.03] border-y border-white/5">
      <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">
        {label} · {count}
      </p>
    </div>
  );
}

export function FriendsOutPill() {
  const { data, isLoading } = useFriendsOutStatus();
  const { openFriendCard } = useFriendIdCard();
  const [expanded, setExpanded] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  // Get user's current position for proximity sorting
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
      () => {},
      { maximumAge: 5 * 60_000, timeout: 5000 }
    );
  }, []);

  const outFriends = data?.outFriends || [];
  const tbdFriends = data?.planningFriends || [];

  if (isLoading || (outFriends.length === 0 && tbdFriends.length === 0)) return null;

  const parts: string[] = [];
  if (outFriends.length > 0) parts.push(`${outFriends.length} out`);
  if (tbdFriends.length > 0) parts.push(`${tbdFriends.length} TBD`);

  // Group out friends by ring, sorted by proximity within each group
  const outByRing = new Map<FriendRing, FriendOutStatus[]>();
  for (const ring of RING_ORDER) {
    const group = outFriends.filter(f => f.ring === ring);
    if (group.length > 0) {
      outByRing.set(ring, sortByProximity(group, userLat, userLng));
    }
  }

  // Group TBD friends by ring
  const tbdByRing = new Map<FriendRing, FriendOutStatus[]>();
  for (const ring of RING_ORDER) {
    const group = tbdFriends.filter(f => f.ring === ring);
    if (group.length > 0) {
      tbdByRing.set(ring, sortByProximity(group, userLat, userLng));
    }
  }

  const handleTap = (friend: FriendOutStatus) => {
    openFriendCard({
      userId: friend.user_id,
      displayName: friend.display_name,
      avatarUrl: friend.avatar_url,
      venueName: friend.venue_name ?? undefined,
    });
    setExpanded(false);
  };

  // Only show section headers if friends span more than one ring
  const outRingCount = outByRing.size;
  const tbdRingCount = tbdByRing.size;
  const showOutHeaders = outRingCount > 1;
  const showTbdHeaders = tbdRingCount > 1;

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[34]"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+8px)] left-4 z-[35] flex flex-col items-start">
        {/* Expanded List */}
        {expanded && (
          <div className="mb-2 w-72 bg-[#1a0a2e]/95 backdrop-blur border border-white/10 rounded-2xl max-h-80 overflow-y-auto">
            {/* Out Friends — sectioned by ring */}
            {RING_ORDER.map(ring => {
              const group = outByRing.get(ring);
              if (!group) return null;
              return (
                <div key={`out-${ring}`}>
                  {showOutHeaders && <SectionHeader label={RING_LABELS[ring]} count={group.length} />}
                  {group.map(friend => (
                    <FriendRow key={friend.user_id} friend={friend} onTap={() => handleTap(friend)} />
                  ))}
                </div>
              );
            })}

            {/* TBD divider */}
            {tbdFriends.length > 0 && outFriends.length > 0 && (
              <div className="px-3 py-1.5 bg-white/[0.03] border-y border-white/5">
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">
                  TBD tonight · {tbdFriends.length}
                </p>
              </div>
            )}

            {/* TBD Friends — sectioned by ring */}
            {RING_ORDER.map(ring => {
              const group = tbdByRing.get(ring);
              if (!group) return null;
              return (
                <div key={`tbd-${ring}`}>
                  {showTbdHeaders && <SectionHeader label={RING_LABELS[ring]} count={group.length} />}
                  {group.map(friend => (
                    <FriendRow key={friend.user_id} friend={friend} onTap={() => handleTap(friend)} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Pill Button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#1a0a2e]/90 backdrop-blur border border-white/10 hover:bg-[#1a0a2e] transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-[#d4ff00]" />
          <span className="text-white/80 text-xs font-medium">{parts.join(' · ')}</span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-white/40" />
          )}
        </button>
      </div>
    </>
  );
}
