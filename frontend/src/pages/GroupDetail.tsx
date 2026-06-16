import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import type { GroupDetail as GroupDetailType, GroupWatchlistItem, WatchlistStatus, TMDBContent } from '../types'
import GroupContentSearchResult from '../components/groups/GroupContentSearchResult'

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

export default function GroupDetail() {
  const { groupId: groupIdParam } = useParams<{ groupId: string }>()
  const groupId = Number(groupIdParam)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [copied, setCopied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const { data: group, isLoading, isError, error } = useQuery<GroupDetailType>({
    queryKey: ['group', groupId],
    queryFn: () => api.get(`/groups/${groupId}`).then((r) => r.data),
  })

  const { data: items = [] } = useQuery<GroupWatchlistItem[]>({
    queryKey: ['group-watchlist', groupId],
    queryFn: () => api.get(`/groups/${groupId}/watchlist`).then((r) => r.data),
    enabled: !!group,
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: WatchlistStatus }) =>
      api.patch(`/groups/${groupId}/watchlist/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-watchlist', groupId] }),
  })

  const removeItem = useMutation({
    mutationFn: (id: number) => api.delete(`/groups/${groupId}/watchlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-watchlist', groupId] }),
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => api.delete(`/groups/${groupId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
  })

  const leaveGroup = useMutation({
    mutationFn: () => api.delete(`/groups/${groupId}/members/me`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate('/groups')
    },
  })

  const deleteGroup = useMutation({
    mutationFn: () => api.delete(`/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate('/groups')
    },
  })

  function copyInviteCode() {
    if (!group) return
    navigator.clipboard.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
      </div>
    )
  }

  if (isError || !group) {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    return (
      <div className="py-20 text-center">
        <p className="mb-3 text-trove-muted">{detail ?? "This group doesn't exist or you don't have access."}</p>
        <Link to="/groups" className="text-trove-accent hover:underline">Back to Groups</Link>
      </div>
    )
  }

  const isOwner = group.owner_id === user?.id
  const addedTmdbKeys = new Set(items.map((i) => `${i.tmdb_id}-${i.media_type}`))

  return (
    <div>
      <Link to="/groups" className="mb-4 inline-block text-sm text-trove-muted hover:text-trove-text">
        ← Back to Groups
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-trove-text">{group.name}</h1>
          <p className="mt-0.5 text-sm text-trove-muted">
            {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyInviteCode}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm text-trove-text transition-colors hover:border-trove-accent"
            title="Copy invite code"
          >
            <span className="font-mono tracking-wider">{group.invite_code}</span>
            <span className="text-xs text-trove-muted">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          {isOwner ? (
            <button
              onClick={() => deleteGroup.mutate()}
              disabled={deleteGroup.isPending}
              className="cursor-pointer rounded-lg border border-trove-border px-3 py-2 text-sm text-trove-muted transition-colors hover:border-red-400 hover:text-red-400"
            >
              Delete Group
            </button>
          ) : (
            <button
              onClick={() => leaveGroup.mutate()}
              disabled={leaveGroup.isPending}
              className="cursor-pointer rounded-lg border border-trove-border px-3 py-2 text-sm text-trove-muted transition-colors hover:border-red-400 hover:text-red-400"
            >
              Leave Group
            </button>
          )}
        </div>
      </div>

      {/* Members */}
      <section className="mb-6 rounded-xl border border-trove-border bg-trove-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-trove-muted">Members</p>
        <div className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center gap-2 rounded-full border border-trove-border bg-trove-surface px-3 py-1.5"
            >
              {m.avatar_url ? (
                <img src={m.avatar_url} alt={m.name} className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-trove-accent text-[10px] font-semibold text-white">
                  {m.name[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-sm text-trove-text">{m.name}</span>
              {m.role === 'owner' && <span className="text-xs text-trove-accent">Owner</span>}
              {isOwner && m.role !== 'owner' && (
                <button
                  onClick={() => removeMember.mutate(m.user_id)}
                  className="cursor-pointer text-trove-muted transition-colors hover:text-red-400"
                  title="Remove member"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Shared watchlist */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-trove-text">Shared Watchlist</h2>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover"
          >
            {showAdd ? 'Done' : '+ Add Title'}
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 rounded-xl border border-trove-border bg-trove-card p-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search movies and shows..."
              autoFocus
              className="mb-3 w-full rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm text-trove-text placeholder-trove-muted outline-none focus:border-trove-accent"
            />
            <GroupSearchResults groupId={groupId} query={search} addedTmdbKeys={addedTmdbKeys} />
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-trove-muted">Nothing in the shared watchlist yet. Add a title to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-trove-border bg-trove-card p-3"
              >
                <div>
                  <p className="font-semibold text-trove-text">{item.title}</p>
                  <p className="text-xs text-trove-muted">
                    <span className="capitalize">{item.media_type}</span> · Added by {item.added_by_name}
                  </p>
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
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function GroupSearchResults({
  groupId,
  query,
  addedTmdbKeys,
}: {
  groupId: number
  query: string
  addedTmdbKeys: Set<string>
}) {
  const { data, isFetching } = useQuery<{ results: TMDBContent[] }>({
    queryKey: ['group-content-search', query],
    queryFn: () => api.get('/content/search', { params: { query } }).then((r) => r.data),
    enabled: query.trim().length > 0,
  })

  if (!query.trim()) return null
  if (isFetching) {
    return (
      <div className="flex justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
      </div>
    )
  }

  const results = data?.results ?? []
  if (results.length === 0) {
    return <p className="py-4 text-center text-sm text-trove-muted">No results.</p>
  }

  return (
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {results.map((r) => (
        <GroupContentSearchResult
          key={`${r.id}-${r.media_type}`}
          groupId={groupId}
          result={r}
          alreadyAdded={addedTmdbKeys.has(`${r.id}-${r.media_type}`)}
        />
      ))}
    </div>
  )
}
