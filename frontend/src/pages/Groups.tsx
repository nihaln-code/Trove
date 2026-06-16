import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import type { Group } from '../types'

export default function Groups() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const { data: groups = [], isLoading } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups').then((r) => r.data),
  })

  const createGroup = useMutation({
    mutationFn: (name: string) => api.post('/groups', { name }).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate(`/groups/${data.id}`)
    },
  })

  const joinGroup = useMutation({
    mutationFn: (invite_code: string) => api.post('/groups/join', { invite_code }).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate(`/groups/${data.id}`)
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim()) createGroup.mutate(name.trim())
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (inviteCode.trim()) joinGroup.mutate(inviteCode.trim())
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-trove-text">Groups</h1>
          <p className="mt-0.5 text-sm text-trove-muted">Shared watchlists with roommates, partners, or family</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowJoin((v) => !v); setShowCreate(false) }}
            className="cursor-pointer rounded-lg border border-trove-border bg-trove-surface px-4 py-2 text-sm font-medium text-trove-text transition-colors hover:border-trove-accent"
          >
            Join with Code
          </button>
          <button
            onClick={() => { setShowCreate((v) => !v); setShowJoin(false) }}
            className="cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover"
          >
            + Create Group
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-trove-border bg-trove-card p-4">
          <label className="mb-1.5 block text-sm font-medium text-trove-text">Group name</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Roommates"
              autoFocus
              className="flex-1 rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm text-trove-text placeholder-trove-muted outline-none focus:border-trove-accent"
            />
            <button
              type="submit"
              disabled={createGroup.isPending || !name.trim()}
              className="cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover disabled:opacity-50"
            >
              Create
            </button>
          </div>
          {createGroup.isError && (
            <p className="mt-2 text-xs text-red-400">Something went wrong creating the group.</p>
          )}
        </form>
      )}

      {showJoin && (
        <form onSubmit={handleJoin} className="mb-6 rounded-xl border border-trove-border bg-trove-card p-4">
          <label className="mb-1.5 block text-sm font-medium text-trove-text">Invite code</label>
          <div className="flex gap-2">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB12CD34"
              autoFocus
              className="flex-1 rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm uppercase tracking-wider text-trove-text placeholder-trove-muted outline-none focus:border-trove-accent"
            />
            <button
              type="submit"
              disabled={joinGroup.isPending || !inviteCode.trim()}
              className="cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover disabled:opacity-50"
            >
              Join
            </button>
          </div>
          {joinGroup.isError && (
            <p className="mt-2 text-xs text-red-400">
              {(joinGroup.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not join group.'}
            </p>
          )}
        </form>
      )}

      {groups.length === 0 ? (
        <div className="py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-trove-surface text-trove-muted">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          </div>
          <p className="text-trove-muted">No groups yet. Create one or join with an invite code.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="rounded-xl border border-trove-border bg-trove-card p-4 transition-colors hover:border-trove-accent"
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="font-semibold text-trove-text">{group.name}</p>
                {group.owner_id === user?.id && (
                  <span className="rounded-full bg-trove-accent/15 px-2 py-0.5 text-xs text-trove-accent">Owner</span>
                )}
              </div>
              <p className="text-sm text-trove-muted">
                {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
