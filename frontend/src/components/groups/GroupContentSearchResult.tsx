import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { TMDB_IMAGE } from '../../services/api'
import type { TMDBContent } from '../../types'

interface Props {
  groupId: number
  result: TMDBContent
  alreadyAdded: boolean
}

export default function GroupContentSearchResult({ groupId, result, alreadyAdded }: Props) {
  const queryClient = useQueryClient()
  const title = result.title || result.name || 'Unknown'
  const year = (result.release_date || result.first_air_date || '').slice(0, 4)
  const poster = TMDB_IMAGE(result.poster_path, 'w92')

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/groups/${groupId}/watchlist`, {
        tmdb_id: result.id,
        media_type: result.media_type,
        title,
        poster_path: result.poster_path,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-watchlist', groupId] }),
  })

  return (
    <div className="flex items-center gap-3 rounded-lg border border-trove-border bg-trove-surface p-2.5">
      <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-trove-border">
        {poster ? (
          <img src={poster} alt={title} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-trove-text">{title}</p>
        <p className="text-xs text-trove-muted">
          {year} <span className="capitalize">· {result.media_type}</span>
        </p>
      </div>
      <button
        onClick={() => !alreadyAdded && addMutation.mutate()}
        disabled={alreadyAdded || addMutation.isPending}
        className={`flex-shrink-0 cursor-pointer rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          alreadyAdded
            ? 'cursor-default bg-trove-accent/10 text-trove-accent'
            : 'bg-trove-accent text-white hover:bg-trove-accent-hover'
        }`}
      >
        {alreadyAdded ? 'Added' : 'Add'}
      </button>
    </div>
  )
}
