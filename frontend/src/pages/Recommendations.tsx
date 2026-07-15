import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api, { TMDB_IMAGE } from '../services/api'
import type { RecommendationItem, WatchlistItem, WatchlistStatus } from '../types'
import { STATUS_BUTTONS } from '../types'
import ContentModal from '../components/content/ContentModal'
import RatingButtons from '../components/content/RatingButtons'
import ScrollablePillRow from '../components/ui/ScrollablePillRow'
import { LANGUAGES } from '../constants/languages'
import { RecommendationCardSkeleton } from '../components/ui/Skeletons'

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Recommendations() {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<RecommendationItem[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [languageIds, setLanguageIds] = useState<Set<string>>(new Set())
  const [genreId, setGenreId] = useState<number | null>(null)
  const loadMorePage = useRef(2)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const languagesKey = Array.from(languageIds).sort().join(',')

  const { data: watchlist = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: () => api.get('/watchlist').then((r) => r.data),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['streaming-services'],
    queryFn: () => api.get('/streaming-services').then((r) => r.data),
  })

  // Recommendations mix movies and TV, so merge both genre lists (dedupe by id)
  const { data: genres = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['genres-merged'],
    queryFn: async () => {
      const [movies, tv] = await Promise.all([
        api.get('/content/genres', { params: { media_type: 'movie' } }),
        api.get('/content/genres', { params: { media_type: 'tv' } }),
      ])
      const merged = new Map<number, { id: number; name: string }>()
      for (const g of [...movies.data, ...tv.data]) {
        if (!merged.has(g.id)) merged.set(g.id, g)
      }
      return Array.from(merged.values())
    },
  })

  // Auto-fetch on mount — cache makes this instant on repeat visits
  const { data: recsData, isLoading, error } = useQuery<{ items: RecommendationItem[]; generated_at: string }>({
    queryKey: ['recommendations', languagesKey, genreId],
    queryFn: () =>
      api
        .get('/recommendations', { params: { languages: languagesKey || undefined, genre_id: genreId ?? undefined } })
        .then((r) => r.data),
    enabled: services.length > 0 && watchlist.length > 0,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (recsData) {
      setItems(recsData.items ?? [])
      setGeneratedAt(recsData.generated_at ?? null)
      loadMorePage.current = 2
    }
  }, [recsData])

  const refreshMutation = useMutation({
    mutationFn: () =>
      api
        .post('/recommendations/refresh', null, { params: { languages: languagesKey || undefined, genre_id: genreId ?? undefined } })
        .then((r) => r.data),
  })

  useEffect(() => {
    const data = refreshMutation.data as { items: RecommendationItem[]; generated_at: string } | undefined
    if (data?.items?.length) {
      setItems(data.items)
      setGeneratedAt(data.generated_at)
      setRefreshError(null)
      loadMorePage.current = 2
      queryClient.setQueryData(['recommendations', languagesKey, genreId], data)
    }
  }, [refreshMutation.data])

  useEffect(() => {
    if (refreshMutation.error) {
      const e = refreshMutation.error as { response?: { data?: { detail?: string } } }
      setRefreshError(e?.response?.data?.detail ?? 'Refresh failed')
    }
  }, [refreshMutation.error])

  const addToWatchlist = useMutation({
    mutationFn: ({ item, status }: { item: RecommendationItem; status: WatchlistStatus }) =>
      api.post('/watchlist', {
        tmdb_id: item.tmdb_id, media_type: item.media_type,
        title: item.title, poster_path: item.poster_path, status,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const updateWatchlist = useMutation({
    mutationFn: ({ id, status }: { id: number; status: WatchlistStatus }) =>
      api.patch(`/watchlist/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const removeFromWatchlist = useMutation({
    mutationFn: (id: number) => api.delete(`/watchlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  function handleStatus(item: RecommendationItem, status: WatchlistStatus) {
    const entry = watchlist.find((w) => w.tmdb_id === item.tmdb_id && w.media_type === item.media_type)
    if (!entry) addToWatchlist.mutate({ item, status })
    else if (entry.status === status) removeFromWatchlist.mutate(entry.id)
    else updateWatchlist.mutate({ id: entry.id, status })
  }

  function toggleLanguage(code: string) {
    setItems([])
    loadMorePage.current = 2
    setLanguageIds((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function selectGenre(id: number | null) {
    setItems([])
    loadMorePage.current = 2
    setGenreId(id)
  }

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading) return
    setIsLoadingMore(true)
    const page = loadMorePage.current
    try {
      const { data } = await api.get('/recommendations', {
        params: { page, languages: languagesKey || undefined, genre_id: genreId ?? undefined },
      })
      const newItems: RecommendationItem[] = Array.isArray(data) ? data : data.items ?? []
      if (newItems.length > 0) {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => `${i.tmdb_id}-${i.media_type}`))
          return [...prev, ...newItems.filter((i) => !seen.has(`${i.tmdb_id}-${i.media_type}`))]
        })
        loadMorePage.current = page + 1
      }
    } catch {
      // silently ignore
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, isLoading, languagesKey, genreId])

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting) loadMore()
    },
    [loadMore],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || items.length === 0) return
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '300px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect, items.length])

  const noServices = services.length === 0
  const emptyWatchlist = watchlist.length === 0

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <h1 className="mb-2 font-display text-3xl text-trove-text">For You</h1>
        <p className="mb-4 max-w-lg text-sm text-trove-muted">
          Recommendations based on your watchlist, refreshed automatically every 2 hours.
        </p>

        {(noServices || emptyWatchlist) ? (
          <div className="rounded-xl border border-trove-border bg-trove-surface p-6 text-sm text-trove-muted">
            {noServices ? (
              <p><Link to="/profile" className="text-trove-accent hover:underline">Add streaming services</Link> to get recommendations.</p>
            ) : (
              <p><Link to="/browse" className="text-trove-accent hover:underline">Add titles to your watchlist</Link> so we can understand your taste.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-trove-border bg-trove-surface px-5 py-2 text-sm font-medium text-trove-muted transition-colors hover:border-trove-accent hover:text-trove-text disabled:opacity-50"
            >
              {refreshMutation.isPending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
            {generatedAt && !refreshMutation.isPending && (
              <p className="text-xs text-trove-muted">Updated {timeAgo(generatedAt)}</p>
            )}
            {refreshError && (
              <p className="text-xs text-amber-400">{refreshError}</p>
            )}
          </div>
        )}
      </div>

      {!(noServices || emptyWatchlist) && (
        <div className="mx-auto mb-6 w-full max-w-xl">
          <ScrollablePillRow>
            {LANGUAGES.map((l) => {
              const active = languageIds.has(l.code)
              return (
                <button
                  key={l.code}
                  onClick={() => toggleLanguage(l.code)}
                  className={`flex-shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-trove-accent bg-trove-accent text-white'
                      : 'border-trove-border bg-trove-surface text-trove-muted hover:border-trove-accent/50 hover:text-trove-text'
                  }`}
                >
                  {l.name}
                </button>
              )
            })}
          </ScrollablePillRow>
        </div>
      )}

      {!(noServices || emptyWatchlist) && genres.length > 0 && (
        <div className="mx-auto mb-6 w-full max-w-xl">
          <ScrollablePillRow>
            <button
              onClick={() => selectGenre(null)}
              className={`flex-shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                !genreId
                  ? 'border-trove-accent bg-trove-accent text-white'
                  : 'border-trove-border bg-trove-surface text-trove-muted hover:border-trove-accent/50 hover:text-trove-text'
              }`}
            >
              All
            </button>
            {genres.map((g) => (
              <button
                key={g.id}
                onClick={() => selectGenre(g.id)}
                className={`flex-shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  genreId === g.id
                    ? 'border-trove-accent bg-trove-accent text-white'
                    : 'border-trove-border bg-trove-surface text-trove-muted hover:border-trove-accent/50 hover:text-trove-text'
                }`}
              >
                {g.name}
              </button>
            ))}
          </ScrollablePillRow>
        </div>
      )}

      {error && (
        <div className="mx-auto mb-6 max-w-lg rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {(error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Failed to load recommendations.'}
        </div>
      )}

      {isLoading && items.length === 0 && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <RecommendationCardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && !refreshMutation.isPending && items.length === 0 && !noServices && !emptyWatchlist && (
        <div className="mx-auto max-w-md rounded-xl border border-trove-border bg-trove-surface p-8 text-center">
          <p className="mb-2 text-sm font-medium text-trove-text">No recommendations found</p>
          <p className="text-sm text-trove-muted">
            Try adding more titles to your <Link to="/watchlist" className="text-trove-accent hover:underline">watchlist</Link>, or check that your streaming services are set up in your <Link to="/profile" className="text-trove-accent hover:underline">profile</Link>.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <div
                key={`${item.tmdb_id}-${item.media_type}`}
                className="flex flex-col overflow-hidden rounded-xl border border-trove-border bg-trove-card cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:ring-1 hover:ring-trove-accent/30 hover:shadow-xl hover:shadow-black/50"
                onClick={() => setSelectedItem(item)}
              >
                <div className="aspect-[2/3] overflow-hidden bg-trove-border">
                  {TMDB_IMAGE(item.poster_path) ? (
                    <img src={TMDB_IMAGE(item.poster_path)!} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-xs text-trove-muted">{item.title}</div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3">
                  <p className="mb-1 line-clamp-2 text-sm font-semibold text-trove-text">{item.title}</p>
                  <p className="mb-2 line-clamp-3 text-xs text-trove-muted">{item.reason}</p>

                  <div className="mb-3 flex flex-wrap gap-1">
                    {item.available_on.map((svc) => (
                      <span key={svc} className="rounded bg-trove-accent/20 px-1.5 py-0.5 text-xs text-trove-accent">{svc}</span>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-col gap-1.5">
                    {STATUS_BUTTONS.map(({ status, label }) => {
                      const entry = watchlist.find((w) => w.tmdb_id === item.tmdb_id && w.media_type === item.media_type)
                      const isActive = entry?.status === status
                      const isPending = addToWatchlist.isPending || updateWatchlist.isPending || removeFromWatchlist.isPending
                      return (
                        <button
                          key={status}
                          onClick={(e) => { e.stopPropagation(); handleStatus(item, status) }}
                          disabled={isPending}
                          className={`flex w-full cursor-pointer items-center justify-center gap-1.5 rounded py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            isActive ? 'bg-trove-accent text-white' : 'bg-trove-surface text-trove-muted hover:bg-trove-border hover:text-trove-text'
                          }`}
                        >
                          {isActive && (
                            <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                          {label}
                        </button>
                      )
                    })}
                    {(() => {
                      const entry = watchlist.find((w) => w.tmdb_id === item.tmdb_id && w.media_type === item.media_type)
                      return entry?.status === 'watched' ? (
                        <div className="flex items-center justify-between border-t border-trove-border pt-1.5">
                          <span className="text-xs text-trove-muted">Rate it</span>
                          <RatingButtons entryId={entry.id} currentRating={entry.rating} size="sm" />
                        </div>
                      ) : null
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div ref={sentinelRef} className="flex justify-center py-8">
            {isLoadingMore && (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
            )}
          </div>
        </>
      )}

      {selectedItem && (
        <ContentModal
          tmdbId={selectedItem.tmdb_id}
          mediaType={selectedItem.media_type as 'movie' | 'tv'}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
