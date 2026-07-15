import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../store/auth'
import api from '../services/api'
import type { GroupPreview } from '../types'

export default function JoinGroup() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const navigate = useNavigate()
  const { user, setUser, isLoading: authLoading } = useAuthStore()
  const [loginError, setLoginError] = useState(false)

  const { data: preview, isLoading: previewLoading, isError } = useQuery<GroupPreview>({
    queryKey: ['group-preview', inviteCode],
    queryFn: () => api.get(`/groups/preview/${inviteCode}`).then((r) => r.data),
    enabled: !!user && !!inviteCode,
    retry: false,
  })

  const joinGroup = useMutation({
    mutationFn: () => api.post('/groups/join', { invite_code: inviteCode }).then((r) => r.data),
    onSuccess: (data) => navigate(`/groups/${data.id}`),
  })

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    if (!credentialResponse.credential) return
    try {
      const { data } = await api.post('/auth/google', {
        credential: credentialResponse.credential,
      })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      const me = await api.get('/users/me')
      setUser(me.data)
    } catch (err) {
      console.error('Login failed', err)
      setLoginError(true)
    }
  }

  function Card({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-trove-bg px-4">
        <h1 className="mb-8 font-display text-5xl italic tracking-tight text-trove-accent">Trove</h1>
        <div className="w-full max-w-sm rounded-2xl border border-trove-border bg-trove-surface/80 p-8 shadow-2xl shadow-black/60 backdrop-blur-sm">
          {children}
        </div>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-trove-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card>
        <h2 className="mb-1 text-center text-lg font-semibold text-trove-text">You've been invited to a group</h2>
        <p className="mb-6 text-center text-sm text-trove-muted">Sign in to see the invite and join</p>
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setLoginError(true)}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text="continue_with"
          />
        </div>
        {loginError && (
          <p className="mt-3 text-center text-xs text-red-400">Sign-in failed. Please try again.</p>
        )}
      </Card>
    )
  }

  if (previewLoading) {
    return (
      <Card>
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
        </div>
      </Card>
    )
  }

  if (isError || !preview) {
    return (
      <Card>
        <h2 className="mb-2 text-center text-lg font-semibold text-trove-text">Invalid invite link</h2>
        <p className="mb-6 text-center text-sm text-trove-muted">
          This invite code doesn't match any group. It may have been reset.
        </p>
        <Link
          to="/groups"
          className="block cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover"
        >
          Go to Groups
        </Link>
      </Card>
    )
  }

  if (preview.already_member) {
    return (
      <Card>
        <h2 className="mb-2 text-center text-lg font-semibold text-trove-text">You're already in "{preview.name}"</h2>
        <button
          onClick={() => navigate(`/groups/${preview.id}`)}
          className="block w-full cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover"
        >
          Go to Group
        </button>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="mb-1 text-center text-lg font-semibold text-trove-text">You've been invited to join</h2>
      <p className="mb-6 text-center text-2xl font-display italic text-trove-accent">{preview.name}</p>
      <p className="mb-6 text-center text-sm text-trove-muted">
        {preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}
      </p>
      <button
        onClick={() => joinGroup.mutate()}
        disabled={joinGroup.isPending}
        className="block w-full cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover disabled:opacity-50"
      >
        {joinGroup.isPending ? 'Joining...' : 'Join Group'}
      </button>
      {joinGroup.isError && (
        <p className="mt-3 text-center text-xs text-red-400">
          {(joinGroup.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not join group.'}
        </p>
      )}
    </Card>
  )
}
