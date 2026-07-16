import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TMDBContent, WatchlistItem, WatchlistStatus } from '../../types'
import { STATUS_BUTTONS } from '../../types'
import { TMDB_IMAGE } from '../../services/api'
import api from '../../services/api'
import ContentModal from './ContentModal'
import RatingButtons from './RatingButtons'

interface Props {
  item: TMDBContent
  watchlistItems?: WatchlistItem[]
}

export default function ContentCard({ item, watchlistItems = [] }: Props) {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const title = item.title || item.name || 'Unknown'
  const year = (item.release_date || item.first_air_date || '').slice(0, 4)
  const poster = TMDB_IMAGE(item.poster_path)

  const watchlistEntry = watchlistItems.find(
    (w) => w.tmdb_id === item.id && w.media_type === item.media_type,
  )

  const addMutation = useMutation({
    mutationFn: (status: WatchlistStatus) =>
      api.post('/watchlist', {
        tmdb_id: item.id,
        media_type: item.media_type,
        title,
        poster_path: item.poster_path,
        status,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const updateMutation = useMutation({
    mutationFn: (status: WatchlistStatus) =>
      api.patch(`/watchlist/${watchlistEntry!.id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/watchlist/${watchlistEntry!.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const isPending = addMutation.isPending || updateMutation.isPending || removeMutation.isPending

  function handleStatus(status: WatchlistStatus) {
    if (!watchlistEntry) {
      addMutation.mutate(status)
    } else if (watchlistEntry.status === status) {
      removeMutation.mutate()
    } else {
      updateMutation.mutate(status)
    }
  }

  return (
    <>
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-trove-border bg-trove-card cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:ring-1 hover:ring-trove-accent/30 hover:shadow-xl hover:shadow-black/50"
      onClick={() => setShowModal(true)}
    >
      <div className="aspect-[2/3] overflow-hidden bg-trove-border">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-sm text-trove-muted">
            {title}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="mb-1 line-clamp-2 text-sm font-semibold text-trove-text">{title}</p>
        <div className="mb-2 flex items-center gap-2 text-xs text-trove-muted">
          {year && <span>{year}</span>}
          {item.vote_average > 0 && <span>★ {item.vote_average.toFixed(1)}</span>}
          <span className="rounded bg-trove-border px-1 capitalize">{item.media_type}</span>
        </div>

        {item.available_on && item.available_on.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1">
            {item.available_on.map((svc) => (
              <span key={svc} className="rounded bg-trove-accent/20 px-1.5 py-0.5 text-xs text-trove-accent">
                {svc}
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-xs text-amber-400">
            {item.in_theatres
              ? 'In theatres'
              : item.other_providers && item.other_providers.length > 0
                ? `Not on your services, on ${item.other_providers.join(', ')}`
                : item.has_any_streaming
                  ? 'Not on your services'
                  : 'Not currently streaming'}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-1.5">
          {STATUS_BUTTONS.map(({ status, label }) => {
            const isActive = watchlistEntry?.status === status
            return (
              <button
                key={status}
                onClick={(e) => { e.stopPropagation(); handleStatus(status) }}
                disabled={isPending}
                className={`flex w-full cursor-pointer items-center justify-center gap-1.5 rounded py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  isActive
                    ? 'bg-trove-accent text-white'
                    : 'bg-trove-surface text-trove-muted hover:bg-trove-border hover:text-trove-text'
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
          {watchlistEntry?.status === 'watched' && (
            <div className="flex items-center justify-between border-t border-trove-border pt-1.5">
              <span className="text-xs text-trove-muted">Rate it</span>
              <RatingButtons entryId={watchlistEntry.id} currentRating={watchlistEntry.rating} size="sm" />
            </div>
          )}
        </div>
      </div>
    </div>

    {showModal && (
      <ContentModal
        tmdbId={item.id}
        mediaType={item.media_type}
        onClose={() => setShowModal(false)}
      />
    )}
    </>
  )
}
