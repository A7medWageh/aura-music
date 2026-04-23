export default function Loading() {
  return (
    <div className="animate-pulse space-y-8 pb-20">
      {/* Hero skeleton */}
      <div className="h-[60vh] -mx-8 -mt-8 bg-white/5 rounded-b-3xl" />
      {/* Buttons skeleton */}
      <div className="flex gap-3 px-4">
        <div className="w-12 h-12 rounded-full bg-white/5" />
        <div className="w-28 h-12 rounded-full bg-white/5" />
      </div>
      {/* Songs skeleton */}
      <div className="px-4 space-y-2">
        <div className="h-7 w-40 bg-white/5 rounded mb-4" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 px-4">
            <div className="w-6 h-4 bg-white/5 rounded" />
            <div className="w-12 h-12 bg-white/5 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-white/5 rounded w-3/4" />
              <div className="h-2 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
