export function Skeleton({ className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

/** Matches StatTile's shape so a loading stat grid doesn't jump/reflow once real data lands. */
export function StatTileSkeleton() {
  return (
    <div className="glass-card p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

/** Matches a row in AIDecisionFeed/AITopPicks. */
export function ListRowSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-bg/30 p-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-2 h-1 w-32 rounded-full" />
    </div>
  );
}
