import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api, { TMDB_IMAGE } from '../services/api'
import type { RecommendationItem, WatchlistItem } from '../types'

export default function Recommendations() {
  const queryClient = useQueryClient()
  const [fetched, setFetched] = useState(false)

  const { data: watchlist = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: () => api.get('/watchlist').then((r) => r.data),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['streaming-services'],
    queryFn: () => api.get('/streaming-services').then((r) => r.data),
  })

  const {
    data: recommendations,
    isLoading,
    error,
    refetch,
  } = useQuery<RecommendationItem[]>({
    queryKey: ['recommendations'],
    queryFn: () => api.get('/recommendations').then((r) => r.data),
    enabled: false,
  })

  const addToWatchlist = useMutation({
    mutationFn: (item: RecommendationItem) =>
      api.post('/watchlist', {
        tmdb_id: item.tmdb_id,
        media_type: item.media_type,
        title: item.title,
        poster_path: item.poster_path,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  async function handleGenerate() {
    setFetched(true)
    await refetch()
  }

  const inWatchlist = (item: RecommendationItem) =>
    watchlist.some((w) => w.tmdb_id === item.tmdb_id && w.media_type === item.media_type)

  const noServices = services.length === 0
  const emptyWatchlist = watchlist.length === 0

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <h1 className="mb-2 font-display text-3xl text-trove-text">For You</h1>
        <p className="mb-6 max-w-lg text-sm text-trove-muted">
          AI-powered recommendations based on your watchlist, tailored to what's available on your streaming services.
        </p>

        {(noServices || emptyWatchlist) ? (
          <div className="rounded-xl border border-trove-border bg-trove-surface p-6 text-sm text-trove-muted">
            {noServices && (
              <p>
                <Link to="/profile" className="text-trove-accent hover:underline">Add streaming services</Link>{' '}
                to get recommendations.
              </p>
            )}
            {!noServices && emptyWatchlist && (
              <p>
                <Link to="/browse" className="text-trove-accent hover:underline">Add titles to your watchlist</Link>{' '}
                so the AI understands your taste.
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-trove-accent px-8 py-3 font-semibold text-white transition-colors hover:bg-trove-accent-hover disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
                {fetched ? 'Regenerate' : 'Generate'} Recommendations
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mx-auto mb-6 max-w-lg rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {(error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Failed to generate recommendations. Try again.'}
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {recommendations.map((item) => (
            <div
              key={`${item.tmdb_id}-${item.media_type}`}
              className="flex flex-col overflow-hidden rounded-xl border border-trove-border bg-trove-card"
            >
              <div className="aspect-[2/3] overflow-hidden bg-trove-border">
                {TMDB_IMAGE(item.poster_path) ? (
                  <img
                    src={TMDB_IMAGE(item.poster_path)!}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-trove-muted">
                    {item.title}
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col p-3">
                <p className="mb-1 line-clamp-2 text-sm font-semibold text-trove-text">{item.title}</p>
                <p className="mb-2 line-clamp-3 text-xs text-trove-muted">{item.reason}</p>

                {item.available_on.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {item.available_on.map((svc) => (
                      <span
                        key={svc}
                        className="rounded bg-trove-accent/20 px-1.5 py-0.5 text-xs text-trove-accent"
                      >
                        {svc}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="mb-2 text-xs text-trove-muted">Not on your services</span>
                )}

                <button
                  onClick={() => addToWatchlist.mutate(item)}
                  disabled={inWatchlist(item) || addToWatchlist.isPending}
                  className={`mt-auto flex w-full cursor-pointer items-center justify-center gap-1.5 rounded py-1.5 text-xs font-semibold transition-colors ${
                    inWatchlist(item)
                      ? 'cursor-default bg-trove-surface text-trove-muted'
                      : 'bg-trove-accent text-white hover:bg-trove-accent-hover'
                  }`}
                >
                  {inWatchlist(item) ? (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      In Watchlist
                    </>
                  ) : (
                    '+ Watchlist'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
