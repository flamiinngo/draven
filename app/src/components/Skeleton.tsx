interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`bg-skeleton rounded animate-shimmer ${className}`}
      style={{
        backgroundImage: "linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%)",
        backgroundSize:  "200% 100%",
      }}
    />
  );
}

export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}`} />
      ))}
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded p-6 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-36" />
    </div>
  );
}
