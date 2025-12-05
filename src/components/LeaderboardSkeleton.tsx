export function LeaderboardSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div 
          key={i} 
          className="rounded-2xl p-4 bg-[#2d1b4e]/40 border border-[#a855f7]/10"
        >
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 bg-[#a855f7]/20 rounded" />
            <div className="flex-1 h-5 bg-[#a855f7]/20 rounded" />
            <div className="flex -space-x-2">
              {[1, 2].map(j => (
                <div key={j} className="h-6 w-6 bg-[#a855f7]/20 rounded-full" />
              ))}
            </div>
            <div className="flex gap-0.5 items-end">
              {[1, 2, 3].map(k => (
                <div key={k} className={`w-1.5 bg-[#a855f7]/20 rounded-sm ${k === 1 ? 'h-2' : k === 2 ? 'h-3' : 'h-4'}`} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
