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
      setLoginError('Sign-in is taking longer than expected. The server may be waking up, please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-trove-bg lg:flex-row">
      {/* Visual panel: a scattered wall of real posters, everyone's separate picks pulled into one view */}
      <div className="relative h-96 w-full flex-shrink-0 overflow-hidden bg-trove-surface sm:h-[28rem] lg:h-auto lg:w-[45%]">
        <div className="absolute inset-0 flex items-center justify-center p-8 sm:p-12 lg:p-10" aria-hidden="true">
          <div className="relative h-64 w-full max-w-xs sm:h-80 sm:max-w-sm lg:h-[36rem] lg:max-w-xl">
            <img
              src="https://image.tmdb.org/t/p/w500/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg"
              alt="Se7en"
              className="absolute left-0 top-0 z-10 h-28 w-20 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-lg shadow-black/50 motion-reduce:animate-none [--rot:-14deg] [--tx:-18px] [--ty:-12px] [animation-delay:0ms] sm:h-36 sm:w-24 lg:h-52 lg:w-36"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/nNAeTmF4CtdSgMDplXTDPOpYzsX.jpg"
              alt="Star Wars: The Empire Strikes Back"
              className="absolute right-0 top-0 z-10 h-28 w-20 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-lg shadow-black/50 motion-reduce:animate-none [--rot:14deg] [--tx:18px] [--ty:-12px] [animation-delay:40ms] sm:h-36 sm:w-24 lg:h-52 lg:w-36"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/6Ryitt95xrO8KXuqRGm1fUuNwqF.jpg"
              alt="Coco"
              className="absolute bottom-0 left-0 z-10 h-28 w-20 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-lg shadow-black/50 motion-reduce:animate-none [--rot:12deg] [--tx:-16px] [--ty:14px] [animation-delay:80ms] sm:h-36 sm:w-24 lg:h-52 lg:w-36"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/vuza0WqY239yBXOadKlGwJsZJFE.jpg"
              alt="The Truman Show"
              className="absolute bottom-0 right-0 z-10 h-28 w-20 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-lg shadow-black/50 motion-reduce:animate-none [--rot:-11deg] [--tx:16px] [--ty:14px] [animation-delay:120ms] sm:h-36 sm:w-24 lg:h-52 lg:w-36"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/lBYOKAMcxIvuk9s9hMuecB9dPBV.jpg"
              alt="The Pursuit of Happyness"
              className="absolute left-[20%] top-[8%] z-20 h-32 w-24 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-xl shadow-black/50 motion-reduce:animate-none [--rot:-7deg] [--tx:-14px] [--ty:-10px] [animation-delay:160ms] sm:h-48 sm:w-32 lg:h-64 lg:w-44"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/wFSpyMsp7H0ttERbxY7Trlv8xry.jpg"
              alt="Monsters, Inc."
              className="absolute right-[20%] top-[8%] z-20 h-32 w-24 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-xl shadow-black/50 motion-reduce:animate-none [--rot:8deg] [--tx:14px] [--ty:-10px] [animation-delay:200ms] sm:h-48 sm:w-32 lg:h-64 lg:w-44"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/puHRt6Raovm5ujGCdwLWvRv4NHU.jpg"
              alt="Taare Zameen Par"
              className="absolute bottom-[10%] left-[22%] z-20 h-32 w-24 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-xl shadow-black/50 motion-reduce:animate-none [--rot:-5deg] [--tx:-12px] [--ty:12px] [animation-delay:240ms] sm:h-48 sm:w-32 lg:h-64 lg:w-44"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg"
              alt="Interstellar"
              className="absolute bottom-[10%] right-[22%] z-20 h-32 w-24 origin-center animate-tile-settle rounded-xl border border-white/10 object-cover shadow-xl shadow-black/50 motion-reduce:animate-none [--rot:6deg] [--tx:12px] [--ty:12px] [animation-delay:280ms] sm:h-48 sm:w-32 lg:h-64 lg:w-44"
            />
            <img
              src="https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg"
              alt="Spider-Man: Into the Spider-Verse"
              className="absolute inset-0 z-30 m-auto h-40 w-28 origin-center animate-tile-settle rounded-xl border-2 border-trove-accent object-cover shadow-2xl shadow-black/60 motion-reduce:animate-none [--rot:-2deg] [--tx:0px] [--ty:16px] [animation-delay:340ms] sm:h-60 sm:w-40 lg:h-80 lg:w-56"
            />
          </div>
        </div>

        {/* Blend the panel into the content panel on each layout */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-trove-bg to-transparent lg:hidden" />
        <div className="absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-l from-trove-bg to-transparent lg:block" />
      </div>

      {/* Content panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:px-10 lg:items-start lg:px-20 lg:text-left">
        <h1 className="mb-6 animate-reveal-up font-display text-7xl italic tracking-tight text-trove-accent motion-reduce:animate-none sm:text-8xl">
          Trove
        </h1>

        <p className="mb-2 max-w-md animate-reveal-up text-xl font-medium leading-snug text-trove-text motion-reduce:animate-none [animation-delay:150ms] [text-wrap:balance]">
          A recommendation engine built for groups.
        </p>
        <p className="mb-10 max-w-md animate-reveal-up text-base leading-relaxed text-trove-muted motion-reduce:animate-none [animation-delay:150ms]">
          Start a group, pool everyone's streaming services, and get recommendations everyone will agree on.
        </p>

        <div className="w-full max-w-sm animate-reveal-up rounded-2xl border border-trove-border bg-trove-surface p-8 motion-reduce:animate-none [animation-delay:300ms]">
          <h2 className="mb-1 text-center text-lg font-semibold text-trove-text">Sign in to Trove</h2>
          <p className="mb-6 text-center text-sm text-trove-muted">
            Build shared watchlists with roommates, partners, and friends
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
      </div>
    </div>
  )
}
