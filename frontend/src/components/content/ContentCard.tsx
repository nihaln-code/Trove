import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TMDBContent, WatchlistItem, WatchlistStatus } from '../../types'
import { TMDB_IMAGE } from '../../services/api'
import api from '../../services/api'
import ContentModal from './ContentModal'

interface Props {
  item: TMDBContent
  watchlistItems?: WatchlistItem[]
}

const STATUS_BUTTONS: { status: WatchlistStatus; label: string }[] = [
  { status: 'want_to_watch', label: 'Want to Watch' },
  { status: 'watching',      label: 'Watching'      },
  { status: 'watched',       label: 'Watched'       },
]

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
      className="group relative overflow-hidden rounded-xl bg-trove-card transition-all duration-200 hover:-translate-y-1 hover:ring-1 hover:ring-trove-accent/30 hover:shadow-xl hover:shadow-black/50 cursor-pointer"
      onClick={() => setShowModal(true)}
    >
      <div className="aspect-[2/3] overflow-hidden bg-trove-border">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-sm text-trove-muted">
            {title}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/50 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
        <p className="mb-1 line-clamp-2 text-sm font-semibold text-white">{title}</p>
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-300">
          {year && <span>{year}</span>}
          {item.vote_average > 0 && <span>★ {item.vote_average.toFixed(1)}</span>}
          <span className="rounded bg-white/20 px-1 capitalize">{item.media_type}</span>
        </div>

        <div className="flex flex-col gap-1.5">
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
                    : 'bg-white/10 text-white hover:bg-white/20'
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
