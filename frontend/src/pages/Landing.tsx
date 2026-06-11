import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../store/auth'
import api from '../services/api'

const features = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
    title: 'Unified Browse',
    desc: 'See everything available across all your services at once',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
      </svg>
    ),
    title: 'Smart Watchlist',
    desc: 'Track want to watch, watching, and finished content',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    ),
    title: 'AI Picks',
    desc: 'Personalized recommendations powered by your taste',
  },
]

export default function Landing() {
  const { user, setUser, isLoading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && user) navigate('/browse')
  }, [user, isLoading, navigate])

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
      navigate('/browse')
    } catch (err) {
      console.error('Login failed', err)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-trove-bg px-4">
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-trove-accent/10 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/4 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-amber-800/10 blur-[80px]" />
      <div className="pointer-events-none absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-orange-900/8 blur-[60px]" />

      <div className="relative z-10 flex w-full flex-col items-center">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="mb-5 bg-gradient-to-b from-trove-text via-trove-text to-trove-accent bg-clip-text font-display text-8xl italic tracking-tight text-transparent sm:text-9xl">
            Trove
          </h1>
          <p className="mx-auto max-w-xs text-base leading-relaxed text-trove-muted">
            Every service. Every show. One list.
          </p>
        </div>

        {/* Service names */}
        <div className="mb-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 opacity-25">
          {['Netflix', 'Disney+', 'HBO Max', 'Prime Video', 'Hulu', 'Apple TV+'].map((s) => (
            <span key={s} className="text-xs font-semibold uppercase tracking-[0.15em] text-trove-muted">
              {s}
            </span>
          ))}
        </div>

        {/* Sign-in card */}
        <div className="mb-14 w-full max-w-sm rounded-2xl border border-trove-border bg-trove-surface/80 p-8 shadow-2xl shadow-black/60 backdrop-blur-sm">
          <h2 className="mb-1 text-center text-lg font-semibold text-trove-text">Sign in to Trove</h2>
          <p className="mb-6 text-center text-sm text-trove-muted">
            Track what you watch across all your services
          </p>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => console.error('Google login error')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="continue_with"
            />
          </div>
        </div>

        {/* Features */}
        <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 rounded-xl border border-trove-border/60 bg-trove-surface/30 p-4 backdrop-blur-sm"
            >
              <div className="mt-0.5 flex-shrink-0 rounded-lg bg-trove-accent/10 p-2 text-trove-accent">
                {f.icon}
              </div>
              <div>
                <div className="mb-0.5 text-sm font-semibold text-trove-text">{f.title}</div>
                <div className="text-xs leading-relaxed text-trove-muted">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
