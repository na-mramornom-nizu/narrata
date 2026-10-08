export function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-2xl ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fadeUp">
      <Shimmer className="h-56 w-full rounded-3xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <Shimmer key={i} className="h-28 rounded-3xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Shimmer className="h-80 rounded-3xl" />
        <Shimmer className="h-80 rounded-3xl" />
      </div>
      <Shimmer className="h-32 rounded-3xl" />
    </div>
  );
}