export function RecommendationCardSkeleton() {
  return (
    <div className="animate-pulse flex flex-col overflow-hidden rounded-xl border border-trove-border bg-trove-card">
      <div className="aspect-[2/3] bg-trove-border" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-3 w-3/4 rounded bg-trove-border" />
        <div className="h-3 w-full rounded bg-trove-border" />
        <div className="h-2 w-1/3 rounded bg-trove-border" />
        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          <div className="h-6 rounded bg-trove-border" />
          <div className="h-6 rounded bg-trove-border" />
          <div className="h-6 rounded bg-trove-border" />
        </div>
      </div>
    </div>
  )
}

export function WatchlistItemSkeleton() {
  return (
    <div className="animate-pulse relative flex gap-4 overflow-hidden rounded-xl border border-trove-border bg-trove-card p-3">
      <div className="absolute inset-y-0 left-0 w-0.5 rounded bg-trove-border" />
      <div className="h-24 w-16 flex-shrink-0 rounded-md bg-trove-border" />
      <div className="flex flex-1 flex-col justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-2/3 rounded bg-trove-border" />
          <div className="h-2 w-1/4 rounded bg-trove-border" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-7 w-24 rounded bg-trove-border" />
          <div className="h-7 w-20 rounded bg-trove-border" />
          <div className="h-7 w-16 rounded bg-trove-border" />
        </div>
      </div>
    </div>
  )
}
