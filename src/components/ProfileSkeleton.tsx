import { Skeleton } from '@/components/ui/skeleton';

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between px-4 py-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-24 bg-white/10" />
            <Skeleton className="h-6 w-16 rounded-full bg-white/10" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
            <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
            <Skeleton className="h-12 w-12 rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="px-4 py-6 space-y-6">
        {/* User Identity */}
        <div>
          <Skeleton className="h-6 w-32 bg-white/10" />
          <Skeleton className="h-4 w-40 mt-2 bg-white/10" />
        </div>

        {/* Avatar + Stats */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full bg-white/10" />
          <div className="flex-1">
            <Skeleton className="h-8 w-40 mb-3 bg-white/10" />
            <div className="flex items-center gap-6">
              <div className="text-center">
                <Skeleton className="h-8 w-12 mx-auto bg-white/10" />
                <Skeleton className="h-4 w-16 mt-1 bg-white/10" />
              </div>
              <div className="text-center">
                <Skeleton className="h-8 w-12 mx-auto bg-white/10" />
                <Skeleton className="h-4 w-16 mt-1 bg-white/10" />
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-full bg-white/10" />
          <Skeleton className="h-10 flex-1 rounded-full bg-white/10" />
        </div>

        {/* Location Sharing Card */}
        <div className="bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full bg-white/10" />
              <div>
                <Skeleton className="h-5 w-32 bg-white/10" />
                <Skeleton className="h-4 w-40 mt-1 bg-white/10" />
              </div>
            </div>
            <Skeleton className="h-10 w-[160px] rounded-full bg-white/10" />
          </div>
        </div>

        {/* Spots Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Skeleton className="h-6 w-32 bg-white/10" />
              <Skeleton className="h-4 w-28 mt-1 bg-white/10" />
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="space-y-2">
                <Skeleton className="aspect-square rounded-xl bg-white/10" />
                <Skeleton className="h-4 w-full bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
