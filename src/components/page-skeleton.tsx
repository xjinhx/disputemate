/** Placeholder shown instantly while a route's data loads (used by loading.tsx). */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-1/2 rounded-lg bg-line" />
      <div className="h-4 w-3/4 rounded bg-line" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 rounded-xl border border-line bg-card" />
      ))}
    </div>
  );
}
