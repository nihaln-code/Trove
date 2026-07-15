import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../store/auth'
import api from '../services/api'


export default function Landing() {
  const { user, setUser, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && user) navigate('/browse')
  }, [user, isLoading, navigate])

  async function completeSignIn() {
    const me = await api.get('/users/me')
    setUser(me.data)
    navigate('/browse')
  }

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    if (!credentialResponse.credential) return
    setIsSigningIn(true)
    setLoginError(null)
    try {
      const { data } = await api.post('/auth/google', {
        credential: credentialResponse.credential,
      })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      await completeSignIn()
    } catch (err) {
      console.error('Login failed', err)
      // The server may still be waking up from being idle. If we already got
      // tokens, retry just the follow-up call instead of redoing Google auth.
      if (localStorage.getItem('access_token')) {
        try {
          await completeSignIn()
          return
        } catch (retryErr) {
          console.error('Retry after login failed', retryErr)
        }
      }
      setLoginError('Sign-in is taking longer than expected — the server may be waking up. Please try again.')
    } finally {
      setIsSigningIn(false)
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
          <div className="flex flex-col items-center gap-3">
            {isSigningIn ? (
              <div className="flex items-center gap-2 py-2 text-sm text-trove-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
                Signing in...
              </div>
            ) : (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setLoginError('Google sign-in failed. Please try again.')}
                theme="filled_black"
                shape="rectangular"
                size="large"
                text="continue_with"
              />
            )}
            {loginError && (
              <p className="text-center text-xs text-red-400">{loginError}</p>
            )}
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
