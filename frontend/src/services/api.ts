import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 45000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Shared across all concurrent 401s so a page that fires several requests at
// once (common on mount) triggers exactly one /auth/refresh call instead of
// one per request. Without this, each request reads the same soon-to-be-stale
// refresh token independently, and a single flaky one among them would wipe
// storage and redirect even if a sibling request's refresh actually succeeded.
let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) throw new Error('No refresh token available')
      const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      return data.access_token
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const accessToken = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/'
      }
    }
    return Promise.reject(error)
  },
)

export default api

export const TMDB_IMAGE = (path: string | null, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null
