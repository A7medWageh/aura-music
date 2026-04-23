export default function Loading() {
  return (
    <div className="animate-pulse space-y-10 pb-20">
      <div className="h-10 w-64 bg-white/5 rounded" />
      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-x-4 gap-y-6">
        {[...Array(30)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/5" />
            <div className="w-12 h-2.5 bg-white/5 rounded" />
          </div>
        ))}
      </div>
      <div className="h-10 w-48 bg-white/5 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="aspect-video bg-white/5 rounded-2xl" />)}
      </div>
    </div>
  );
}
