export function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div 
          key={i} 
          className="glass-card rounded-3xl overflow-hidden"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {/* Image skeleton */}
          <div className="w-full aspect-[4/3] shimmer" />
          
          {/* Content skeleton */}
          <div className="p-4 space-y-4">
            {/* User info skeleton */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full shimmer" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-28 rounded-full shimmer" />
                <div className="h-3 w-20 rounded-full shimmer" />
              </div>
              <div className="h-3 w-12 rounded-full shimmer" />
            </div>
            
            {/* Actions skeleton */}
            <div className="flex items-center gap-5">
              <div className="h-7 w-7 rounded-full shimmer" />
              <div className="h-4 w-14 rounded-full shimmer" />
              <div className="h-7 w-7 rounded-full shimmer" />
              <div className="h-4 w-8 rounded-full shimmer" />
              <div className="ml-auto h-7 w-7 rounded-full shimmer" />
            </div>
            
            {/* Text skeleton */}
            <div className="space-y-2">
              <div className="h-4 w-full rounded-full shimmer" />
              <div className="h-4 w-3/4 rounded-full shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
