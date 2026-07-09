function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg border border-border bg-card ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-28" />
      </div>
      <SkeletonCard className="h-80" />
      <SkeletonCard className="h-80" />
    </div>
  );
}
