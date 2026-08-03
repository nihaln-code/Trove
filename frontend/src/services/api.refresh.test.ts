import { describe, it, expect, vi, beforeEach } from 'vitest'

let responseErrorInterceptor: (error: unknown) => unknown

const postMock = vi.fn()
const instanceCallMock = vi.fn()

vi.mock('axios', () => {
  const instance = ((...args: unknown[]) => instanceCallMock(...args)) as {
    (...args: unknown[]): unknown
    interceptors: {
      request: { use: (fn: unknown) => void }
      response: { use: (onFulfilled: unknown, onRejected: (error: unknown) => unknown) => void }
    }
  }
  instance.interceptors = {
    request: { use: () => {} },
    response: {
      use: (_onFulfilled, onRejected) => {
        responseErrorInterceptor = onRejected
      },
    },
  }
  return {
    default: {
      create: () => instance,
      post: postMock,
    },
  }
})

describe('api response interceptor - refresh dedup', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    postMock.mockReset()
    instanceCallMock.mockReset()
    localStorage.setItem('refresh_token', 'old-refresh-token')
    await import('./api')
  })

  it('only calls /auth/refresh once for multiple concurrent 401s', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    })
    instanceCallMock.mockResolvedValue({ data: 'ok' })

    const makeError = () => ({ config: { headers: {} as Record<string, string> }, response: { status: 401 } })

    await Promise.all([
      responseErrorInterceptor(makeError()),
      responseErrorInterceptor(makeError()),
      responseErrorInterceptor(makeError()),
    ])

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('access_token')).toBe('new-access')
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh')
  })

  it('clears storage when the shared refresh fails', async () => {
    postMock.mockRejectedValue(new Error('refresh failed'))
    const originalLocation = window.location
    // @ts-expect-error -- narrowing window.location for a test-only stub
    delete window.location
    // @ts-expect-error -- partial Location stub is enough for this assertion
    window.location = { ...originalLocation, href: '' }

    const error = { config: { headers: {} as Record<string, string> }, response: { status: 401 } }
    await expect(Promise.resolve(responseErrorInterceptor(error))).rejects.toBe(error)

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()

    // @ts-expect-error -- restoring the real Location after the stub above
    window.location = originalLocation
  })

  it('makes a fresh refresh call on a later, non-concurrent 401', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'first-access', refresh_token: 'first-refresh' },
    })
    instanceCallMock.mockResolvedValue({ data: 'ok' })

    const makeError = () => ({ config: { headers: {} as Record<string, string> }, response: { status: 401 } })

    await responseErrorInterceptor(makeError())
    await responseErrorInterceptor(makeError())

    expect(postMock).toHaveBeenCalledTimes(2)
  })
})
