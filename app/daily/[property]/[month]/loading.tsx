function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg border border-border bg-card ${className}`} />;
}

export default function DailyLoading() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <Skeleton className="h-[480px]" />
    </div>
  );
}
