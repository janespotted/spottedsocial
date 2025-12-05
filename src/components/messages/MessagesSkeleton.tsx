export function MessagesSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 bg-[#a855f7]/20 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 bg-[#a855f7]/20 rounded" />
              <div className="h-3 w-20 bg-[#a855f7]/20 rounded" />
              <div className="h-3 w-40 bg-[#a855f7]/20 rounded" />
            </div>
            <div className="h-3 w-12 bg-[#a855f7]/20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Friend Requests skeleton */}
      <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 bg-[#a855f7]/20 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-[#a855f7]/20 rounded" />
            <div className="h-3 w-24 bg-[#a855f7]/20 rounded" />
          </div>
        </div>
      </div>
      
      {/* Activity items skeleton */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 bg-[#a855f7]/20 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-[#a855f7]/20 rounded" />
            </div>
            <div className="h-8 w-20 bg-[#a855f7]/20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function YapSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Venue header skeleton */}
      <div className="text-center">
        <div className="h-8 w-40 bg-[#a855f7]/20 rounded mx-auto" />
      </div>
      
      {/* Sort tabs skeleton */}
      <div className="flex items-center justify-center gap-2">
        <div className="h-10 w-24 bg-[#a855f7]/20 rounded-full" />
        <div className="h-10 w-24 bg-[#a855f7]/20 rounded-full" />
      </div>
      
      {/* Post input skeleton */}
      <div className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
        <div className="h-20 bg-[#a855f7]/10 rounded" />
      </div>
      
      {/* Messages skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[#2d1b4e]/60 border border-[#a855f7]/20 rounded-2xl p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-20 bg-[#a855f7]/20 rounded" />
              <div className="h-3 w-12 bg-[#a855f7]/20 rounded" />
            </div>
            <div className="h-4 w-full bg-[#a855f7]/20 rounded" />
            <div className="h-4 w-3/4 bg-[#a855f7]/20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
