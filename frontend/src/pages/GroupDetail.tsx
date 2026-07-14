import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { TMDB_IMAGE } from '../services/api'
import { useAuthStore } from '../store/auth'
import type { GroupDetail as GroupDetailType, GroupWatchlistItem, GroupRecommendationItem, GroupServicesResponse, WatchlistStatus, TMDBContent } from '../types'
import { STATUS_BUTTONS } from '../types'
import GroupContentSearchResult from '../components/groups/GroupContentSearchResult'
import GroupRatingWidget from '../components/groups/GroupRatingWidget'
import { RecommendationCardSkeleton } from '../components/ui/Skeletons'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
              onClick={() => setShowDeleteConfirm(true)}
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

      {/* Group streaming services */}
      <GroupServicesSection groupId={groupId} />

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
                {item.status === 'watched' && (
                  <div className="border-t border-trove-border pt-2">
                    <GroupRatingWidget
                      groupId={groupId}
                      itemId={item.id}
                      likeCount={item.like_count}
                      dislikeCount={item.dislike_count}
                      likedBy={item.liked_by}
                      myRating={item.my_rating}
                      size="sm"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Group recommendations */}
      <GroupRecommendations groupId={groupId} />

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-trove-border bg-trove-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-trove-text">Delete "{group.name}"?</h2>
            <p className="mb-6 text-sm text-trove-muted">
              This permanently deletes the group, its shared watchlist, and its recommendations for
              every member. This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="cursor-pointer rounded-lg border border-trove-border px-4 py-2 text-sm text-trove-muted transition-colors hover:text-trove-text"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteGroup.mutate()}
                disabled={deleteGroup.isPending}
                className="cursor-pointer rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
              >
                {deleteGroup.isPending ? 'Deleting...' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupServicesSection({ groupId }: { groupId: number }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [providerSearch, setProviderSearch] = useState('')

  const { data } = useQuery<GroupServicesResponse>({
    queryKey: ['group-services', groupId],
    queryFn: () => api.get(`/groups/${groupId}/services`).then((r) => r.data),
  })

  const { data: allProviders = [], isLoading: providersLoading } = useQuery<{ provider_id: number; provider_name: string; logo_path: string | null }[]>({
    queryKey: ['providers', user?.default_region ?? 'US'],
    queryFn: () => api.get('/content/providers', { params: { region: user?.default_region ?? 'US' } }).then((r) => r.data),
    enabled: isEditing,
  })

  function startEditing() {
    setSelectedIds(new Set(data?.active.map((s) => s.tmdb_provider_id) ?? []))
    setProviderSearch('')
    setIsEditing(true)
  }

  function toggleService(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveServices = useMutation({
    mutationFn: () => {
      const services = allProviders
        .filter((p) => selectedIds.has(p.provider_id))
        .map((p) => ({ tmdb_provider_id: p.provider_id, provider_name: p.provider_name, provider_logo_path: p.logo_path }))
      return api.put(`/groups/${groupId}/services`, { services }).then((r) => r.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-services', groupId] })
      queryClient.invalidateQueries({ queryKey: ['group-recommendations', groupId] })
      setIsEditing(false)
    },
  })

  const resetServices = useMutation({
    mutationFn: () => api.delete(`/groups/${groupId}/services`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-services', groupId] })
      queryClient.invalidateQueries({ queryKey: ['group-recommendations', groupId] })
      setIsEditing(false)
    },
  })

  if (!data) return null

  const filteredProviders = allProviders.filter((p) =>
    p.provider_name.toLowerCase().includes(providerSearch.toLowerCase())
  )

  return (
    <section className="mb-6 rounded-xl border border-trove-border bg-trove-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-trove-muted">Streaming Services</p>
          {data.is_custom && (
            <span className="rounded bg-trove-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-trove-accent">
              Custom
            </span>
          )}
        </div>
        {!isEditing && (
          <button
            onClick={startEditing}
            className="cursor-pointer text-xs text-trove-muted transition-colors hover:text-trove-text"
          >
            Edit
          </button>
        )}
      </div>

      {!isEditing ? (
        data.active.length === 0 ? (
          <p className="text-sm text-trove-muted">
            No streaming services — add services in your profile or edit here to set group services.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.active.map((svc) => (
              <div
                key={svc.tmdb_provider_id}
                className="flex items-center gap-1.5 rounded-lg border border-trove-border bg-trove-surface px-2 py-1.5"
              >
                {svc.provider_logo_path ? (
                  <img
                    src={TMDB_IMAGE(svc.provider_logo_path, 'original') ?? ''}
                    alt={svc.provider_name}
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <div className="h-5 w-5 rounded bg-trove-border" />
                )}
                <span className="text-xs text-trove-text">{svc.provider_name}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <div>
          <input
            value={providerSearch}
            onChange={(e) => setProviderSearch(e.target.value)}
            placeholder="Search services..."
            className="mb-3 w-full rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm text-trove-text placeholder-trove-muted outline-none focus:border-trove-accent"
          />
          {providersLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mb-3 max-h-48 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {filteredProviders.map((p) => {
                  const active = selectedIds.has(p.provider_id)
                  return (
                    <button
                      key={p.provider_id}
                      onClick={() => toggleService(p.provider_id)}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
                        active
                          ? 'border-trove-accent bg-trove-accent/10 text-trove-text'
                          : 'border-trove-border bg-trove-surface text-trove-muted hover:border-trove-accent/50'
                      }`}
                    >
                      {p.logo_path ? (
                        <img
                          src={TMDB_IMAGE(p.logo_path, 'original') ?? ''}
                          alt={p.provider_name}
                          className={`h-5 w-5 rounded object-cover ${!active && 'opacity-50'}`}
                        />
                      ) : (
                        <div className="h-5 w-5 rounded bg-trove-border" />
                      )}
                      <span className="text-xs">{p.provider_name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveServices.mutate()}
              disabled={saveServices.isPending || selectedIds.size === 0}
              className="cursor-pointer rounded-lg bg-trove-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-trove-accent-hover disabled:opacity-50"
            >
              {saveServices.isPending ? 'Saving...' : 'Save'}
            </button>
            {data.is_custom && (
              <button
                onClick={() => resetServices.mutate()}
                disabled={resetServices.isPending}
                className="cursor-pointer rounded-lg border border-trove-border px-3 py-1.5 text-xs text-trove-muted transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
              >
                {resetServices.isPending ? 'Resetting...' : 'Reset to Default'}
              </button>
            )}
            <button
              onClick={() => setIsEditing(false)}
              className="cursor-pointer px-3 py-1.5 text-xs text-trove-muted transition-colors hover:text-trove-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

type RecommendationMode = 'group_watchlist' | 'member_tastes'

const MODE_LABELS: Record<RecommendationMode, string> = {
  group_watchlist: 'Based on Watchlist',
  member_tastes: 'Based on Member Tastes',
}

const MODE_DESCRIPTIONS: Record<RecommendationMode, string> = {
  group_watchlist: 'Based on what your group has watched together',
  member_tastes: "Based on each member's personal tastes",
}

function GroupRecommendations({ groupId }: { groupId: number }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<RecommendationMode>('group_watchlist')
  const [items, setItems] = useState<GroupRecommendationItem[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const isLoadingMoreRef = useRef(false)
  const loadMorePage = useRef(2)
  const hasMore = useRef(true)
  const consecutiveEmpty = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  function resetPagination() {
    loadMorePage.current = 2
    hasMore.current = true
    consecutiveEmpty.current = 0
  }

  const { data: groupWatchlist = [] } = useQuery<GroupWatchlistItem[]>({
    queryKey: ['group-watchlist', groupId],
    queryFn: () => api.get(`/groups/${groupId}/watchlist`).then((r) => r.data),
  })

  const { data, isLoading } = useQuery<{ items: GroupRecommendationItem[]; generated_at: string; based_on: 'shared_watchlist' | 'member_tastes' }>({
    queryKey: ['group-recommendations', groupId, mode],
    queryFn: () => api.get(`/groups/${groupId}/recommendations`, { params: { mode } }).then((r) => r.data),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (data) {
      setItems(data.items ?? [])
      resetPagination()
    }
  }, [data])

  function handleModeChange(next: RecommendationMode) {
    if (next === mode) return
    setItems([])
    resetPagination()
    setMode(next)
  }

  const refresh = useMutation({
    mutationFn: () =>
      api.post(`/groups/${groupId}/recommendations/refresh`, null, { params: { mode } }).then((r) => r.data),
    onSuccess: (data: { items: GroupRecommendationItem[]; generated_at: string; based_on: 'shared_watchlist' | 'member_tastes' }) => {
      queryClient.setQueryData(['group-recommendations', groupId, mode], data)
      setItems(data.items ?? [])
      resetPagination()
    },
  })

  const addToWatchlist = useMutation({
    mutationFn: ({ item, status }: { item: GroupRecommendationItem; status: WatchlistStatus }) =>
      api.post(`/groups/${groupId}/watchlist`, {
        tmdb_id: item.tmdb_id, media_type: item.media_type,
        title: item.title, poster_path: item.poster_path, status,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-watchlist', groupId] }),
  })

  const updateWatchlist = useMutation({
    mutationFn: ({ id, status }: { id: number; status: WatchlistStatus }) =>
      api.patch(`/groups/${groupId}/watchlist/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-watchlist', groupId] }),
  })

  const removeFromWatchlist = useMutation({
    mutationFn: (id: number) => api.delete(`/groups/${groupId}/watchlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-watchlist', groupId] }),
  })

  function handleStatus(item: GroupRecommendationItem, status: WatchlistStatus) {
    const entry = groupWatchlist.find((w) => w.tmdb_id === item.tmdb_id && w.media_type === item.media_type)
    if (!entry) addToWatchlist.mutate({ item, status })
    else if (entry.status === status) removeFromWatchlist.mutate(entry.id)
    else updateWatchlist.mutate({ id: entry.id, status })
  }

  const loadMore = useCallback(async () => {
    if (!hasMore.current || isLoadingMoreRef.current || isLoading) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const { data } = await api.get(`/groups/${groupId}/recommendations`, {
        params: { page: loadMorePage.current, mode },
      })
      const newItems: GroupRecommendationItem[] = Array.isArray(data) ? data : data.items ?? []
      if (newItems.length > 0) {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => `${i.tmdb_id}-${i.media_type}`))
          return [...prev, ...newItems.filter((i) => !seen.has(`${i.tmdb_id}-${i.media_type}`))]
        })
        loadMorePage.current += 1
        consecutiveEmpty.current = 0
      } else {
        consecutiveEmpty.current += 1
        if (consecutiveEmpty.current >= 3) {
          hasMore.current = false
        } else {
          // This TMDB page had no available results — skip it and try the next
          loadMorePage.current += 1
        }
      }
    } catch {
      hasMore.current = false
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [isLoading, groupId, mode])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || items.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, items.length])

  const mutationPending = addToWatchlist.isPending || updateWatchlist.isPending || removeFromWatchlist.isPending

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-trove-text">Recommended for Your Group</h2>
          <p className="text-xs text-trove-muted">{MODE_DESCRIPTIONS[mode]}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-trove-border bg-trove-surface p-0.5">
            {(Object.keys(MODE_LABELS) as RecommendationMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`cursor-pointer rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? 'bg-trove-accent text-white' : 'text-trove-muted hover:text-trove-text'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || isLoading}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm text-trove-muted transition-colors hover:border-trove-accent hover:text-trove-text disabled:opacity-50"
          >
            {refresh.isPending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {!isLoading && mode === 'group_watchlist' && data?.based_on === 'member_tastes' && (
        <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Not enough data in your shared watchlist yet, so these are based on member tastes instead. Add at least 3 titles to the shared watchlist to base recommendations on that.
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <RecommendationCardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-trove-border bg-trove-surface py-12 text-center text-sm text-trove-muted">
          {mode === 'group_watchlist'
            ? 'Add at least 3 titles to the shared watchlist and mark them as watched or watching to get recommendations.'
            : 'Make sure everyone has titles in their personal watchlists and streaming services set up.'}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => {
              const entry = groupWatchlist.find((w) => w.tmdb_id === item.tmdb_id && w.media_type === item.media_type)
              return (
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
                    <p className="mb-2 line-clamp-2 text-xs text-trove-muted">{item.reason}</p>

                    <div className="mb-3 flex flex-wrap gap-1">
                      {item.available_on.map((svc) => (
                        <span key={svc} className="rounded bg-trove-accent/20 px-1.5 py-0.5 text-xs text-trove-accent">
                          {svc}
                        </span>
                      ))}
                    </div>

                    <div className="mt-auto flex flex-col gap-1.5">
                      {STATUS_BUTTONS.map(({ status, label }) => {
                        const isActive = entry?.status === status
                        return (
                          <button
                            key={status}
                            onClick={() => handleStatus(item, status)}
                            disabled={mutationPending}
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
                      {entry?.status === 'watched' && (
                        <div className="border-t border-trove-border pt-1.5">
                          <GroupRatingWidget
                            groupId={groupId}
                            itemId={entry.id}
                            likeCount={entry.like_count}
                            dislikeCount={entry.dislike_count}
                            likedBy={entry.liked_by}
                            myRating={entry.my_rating}
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-6">
            {isLoadingMore && (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
            )}
          </div>
        </>
      )}
    </section>
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
