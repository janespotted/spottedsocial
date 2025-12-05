export function FeedSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div 
          key={i} 
          className="bg-[#0a0118]/60 border border-[#a855f7]/20 rounded-3xl p-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-[#a855f7]/20 rounded-full" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-[#a855f7]/20 rounded" />
              <div className="h-3 w-16 bg-[#a855f7]/20 rounded" />
            </div>
          </div>
          <div className="h-64 bg-[#a855f7]/10 rounded-xl mb-4" />
          <div className="flex items-center gap-4">
            <div className="h-6 w-6 bg-[#a855f7]/20 rounded" />
            <div className="h-4 w-16 bg-[#a855f7]/20 rounded" />
            <div className="h-6 w-6 bg-[#a855f7]/20 rounded" />
            <div className="h-4 w-8 bg-[#a855f7]/20 rounded" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-4 w-full bg-[#a855f7]/15 rounded" />
            <div className="h-4 w-3/4 bg-[#a855f7]/15 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
