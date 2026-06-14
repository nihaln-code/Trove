import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../store/auth'
import api from '../services/api'


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
    <div className="flex min-h-screen flex-col items-center justify-center bg-trove-bg px-4">
      <div className="flex w-full flex-col items-center">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="mb-5 font-display text-8xl italic tracking-tight text-trove-accent sm:text-9xl">
            Trove
          </h1>
          <p className="whitespace-nowrap text-base leading-relaxed text-trove-muted">
            Every service. Every movie and show. One list.
          </p>
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
        <div className="w-full max-w-2xl border-t border-trove-border pt-8">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-trove-accent">Browse</p>
              <p className="text-sm leading-relaxed text-trove-muted">Every title across all your streaming services, in one place.</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-trove-accent">Track</p>
              <p className="text-sm leading-relaxed text-trove-muted">Mark what you're watching, what you've finished, and what's next.</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-trove-accent">Discover</p>
              <p className="text-sm leading-relaxed text-trove-muted">Personalized picks generated from your watching history and taste.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
