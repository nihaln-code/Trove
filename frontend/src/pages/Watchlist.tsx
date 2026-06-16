import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { TMDB_IMAGE } from '../services/api'
import type { WatchlistItem, WatchlistStatus } from '../types'
import RatingButtons from '../components/content/RatingButtons'

const STATUS_LABELS: Record<WatchlistStatus, string> = {
  want_to_watch: 'Want to Watch',
  watching: 'Watching',
  watched: 'Watched',
}

const STATUS_COLORS: Record<WatchlistStatus, string> = {
  want_to_watch: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  watching: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  watched: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
}

export default function Watchlist() {
  const [activeStatus, setActiveStatus] = useState<WatchlistStatus | 'all'>('all')
  const queryClient = useQueryClient()

  const { data: items = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: () => api.get('/watchlist').then((r) => r.data),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: WatchlistStatus }) =>
      api.patch(`/watchlist/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const removeItem = useMutation({
    mutationFn: (id: number) => api.delete(`/watchlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const filtered = activeStatus === 'all' ? items : items.filter((i) => i.status === activeStatus)

  const counts = {
    all: items.length,
    want_to_watch: items.filter((i) => i.status === 'want_to_watch').length,
    watching: items.filter((i) => i.status === 'watching').length,
    watched: items.filter((i) => i.status === 'watched').length,
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-trove-text">My Watchlist</h1>
        <p className="mt-0.5 text-sm text-trove-muted">{items.length} {items.length === 1 ? 'title' : 'titles'}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'want_to_watch', 'watching', 'watched'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              activeStatus === s
                ? 'border-trove-accent bg-trove-accent text-white'
                : 'border-trove-border bg-trove-surface text-trove-muted hover:text-trove-text'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-trove-surface text-trove-muted">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375Z" />
            </svg>
          </div>
          <p className="text-trove-muted">
            {activeStatus === 'all'
              ? 'Your watchlist is empty. Browse content to add titles.'
              : `No titles with "${STATUS_LABELS[activeStatus]}" status.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="relative flex gap-4 overflow-hidden rounded-xl border border-trove-border bg-trove-card p-3"
            >
              <div className={`absolute inset-y-0 left-0 w-0.5 ${
                item.status === 'watching' ? 'bg-yellow-400' :
                item.status === 'watched' ? 'bg-green-400' :
                'bg-blue-400'
              }`} />
              <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-trove-border">
                {item.poster_path ? (
                  <img
                    src={TMDB_IMAGE(item.poster_path, 'w185') ?? ''}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-1 text-center text-xs text-trove-muted">
                    {item.title}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <p className="truncate font-semibold text-trove-text">{item.title}</p>
                  <span className="mt-0.5 inline-block capitalize text-xs text-trove-muted">
                    {item.media_type}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {(Object.keys(STATUS_LABELS) as WatchlistStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus.mutate({ id: item.id, status: s })}
                      disabled={updateStatus.isPending}
                      className={`cursor-pointer rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        item.status === s
                          ? STATUS_COLORS[s]
                          : 'border-trove-border text-trove-muted hover:text-trove-text'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                  {item.status === 'watched' && (
                    <RatingButtons entryId={item.id} currentRating={item.rating} size="sm" />
                  )}
                  <button
                    onClick={() => removeItem.mutate(item.id)}
                    className="ml-auto cursor-pointer text-trove-muted transition-colors hover:text-red-400"
                    title="Remove"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
