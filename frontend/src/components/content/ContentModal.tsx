import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { TMDB_IMAGE } from '../../services/api'
import type { ContentRatings, WatchlistItem, WatchlistStatus } from '../../types'
import { STATUS_BUTTONS } from '../../types'
import RatingButtons from './RatingButtons'

interface Props {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  onClose: () => void
}

export default function ContentModal({ tmdbId, mediaType, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: detail, isLoading } = useQuery({
    queryKey: ['detail', mediaType, tmdbId],
    queryFn: () => api.get(`/content/${mediaType}/${tmdbId}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: watchlist = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: () => api.get('/watchlist').then((r) => r.data),
  })

  const entry = watchlist.find((w) => w.tmdb_id === tmdbId && w.media_type === mediaType)

  const { data: ratings } = useQuery<ContentRatings>({
    queryKey: ['content-ratings', mediaType, tmdbId],
    queryFn: () => api.get(`/content/${mediaType}/${tmdbId}/ratings`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const addMutation = useMutation({
    mutationFn: (status: WatchlistStatus) =>
      api.post('/watchlist', {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title: detail?.title || detail?.name,
        poster_path: detail?.poster_path,
        status,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const updateMutation = useMutation({
    mutationFn: (status: WatchlistStatus) => api.patch(`/watchlist/${entry!.id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/watchlist/${entry!.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  function handleStatus(status: WatchlistStatus) {
    if (!entry) addMutation.mutate(status)
    else if (entry.status === status) removeMutation.mutate()
    else updateMutation.mutate(status)
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = detail?.title || detail?.name || ''
  const year = (detail?.release_date || detail?.first_air_date || '').slice(0, 4)
  const rating = detail?.vote_average ? detail.vote_average.toFixed(1) : null

  const meta: string[] = []
  if (year) meta.push(year)
  if (rating && Number(rating) > 0) meta.push(`★ ${rating}`)
  if (mediaType === 'movie' && detail?.runtime) {
    const h = Math.floor(detail.runtime / 60)
    const m = detail.runtime % 60
    meta.push(h > 0 ? `${h}h ${m}m` : `${m}m`)
  }
  if (mediaType === 'tv' && detail?.number_of_seasons) {
    meta.push(`${detail.number_of_seasons} season${detail.number_of_seasons !== 1 ? 's' : ''}`)
  }

  const availableProviders: { provider_id: number; provider_name: string; logo_path: string }[] =
    (Object.values(detail?.user_availability ?? {}) as { provider_id: number; provider_name: string; logo_path: string }[][])
      .flat()
      .filter(
        (p, i, arr) =>
          arr.findIndex((x) => x.provider_id === p.provider_id) === i,
      )

  const cast: { id: number; name: string; character: string }[] =
    (detail?.credits?.cast ?? []).slice(0, 6)

  const isPending = addMutation.isPending || updateMutation.isPending || removeMutation.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-trove-border bg-trove-surface shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-trove-border" />
        </div>

        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-trove-card text-trove-muted transition-colors hover:text-trove-text"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {isLoading ? (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
          </div>
        ) : detail ? (
          <div className="flex gap-6 p-6 pr-14">
            {/* Poster */}
            <div className="hidden w-36 flex-shrink-0 sm:block">
              {TMDB_IMAGE(detail.poster_path) ? (
                <img
                  src={TMDB_IMAGE(detail.poster_path)!}
                  alt={title}
                  className="w-full rounded-xl object-cover shadow-lg"
                />
              ) : (
                <div className="aspect-[2/3] rounded-xl bg-trove-border" />
              )}
            </div>

            {/* Details */}
            <div className="min-w-0 flex-1">
              <h2 className="mb-1 font-display text-2xl italic text-trove-text leading-tight">{title}</h2>

              {(meta.length > 0 || (ratings && (ratings.likes > 0 || ratings.dislikes > 0))) && (
                <div className="mb-4">
                  {meta.length > 0 && (
                    <p className="text-sm text-trove-muted">{meta.join(' · ')}</p>
                  )}
                  {ratings && (ratings.likes > 0 || ratings.dislikes > 0) && (
                    <p className="text-xs text-trove-muted">
                      {ratings.likes} liked it · {ratings.dislikes} didn't
                    </p>
                  )}
                </div>
              )}

              {detail.genres?.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {detail.genres.map((g: { id: number; name: string }) => (
                    <span
                      key={g.id}
                      className="rounded-full border border-trove-border px-2.5 py-0.5 text-xs text-trove-muted"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {detail.overview && (
                <p className="mb-4 text-sm leading-relaxed text-trove-text/80">{detail.overview}</p>
              )}

              {cast.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-trove-muted">Cast</p>
                  <p className="text-sm text-trove-text/70">
                    {cast.map((c) => c.name).join(', ')}
                  </p>
                </div>
              )}

              {availableProviders.length > 0 ? (
                <div className="mb-5">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-trove-muted">
                    Available on
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableProviders.map((p) => (
                      <span
                        key={p.provider_id}
                        className="rounded bg-trove-accent/20 px-2 py-0.5 text-xs text-trove-accent"
                      >
                        {p.provider_name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mb-5 text-xs text-amber-400">
                  {detail.in_theatres
                    ? 'Currently in theatres, not yet available to stream.'
                    : detail.has_any_streaming
                      ? "Not available on any of your streaming services."
                      : 'Not currently available to stream anywhere we track.'}
                </p>
              )}

              <div className="flex gap-2">
                {STATUS_BUTTONS.map(({ status, label }) => {
                  const isActive = entry?.status === status
                  return (
                    <button
                      key={status}
                      onClick={() => handleStatus(status)}
                      disabled={isPending}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                        isActive
                          ? 'bg-trove-accent text-white'
                          : 'bg-trove-card text-trove-muted hover:bg-trove-border hover:text-trove-text'
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
              </div>
              {entry?.status === 'watched' && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-trove-card px-3 py-2">
                  <span className="text-xs text-trove-muted">Did you like it?</span>
                  <RatingButtons entryId={entry.id} currentRating={entry.rating} />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
