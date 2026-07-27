import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './auth'
import type { User } from '../types'

const testUser: User = {
  id: 1,
  email: 'user@example.com',
  name: 'Test User',
  avatar_url: null,
  default_region: 'US',
}

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: true })
    localStorage.clear()
  })

  it('starts with no user and isLoading true', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(true)
  })

  it('setUser stores the user', () => {
    useAuthStore.getState().setUser(testUser)
    expect(useAuthStore.getState().user).toEqual(testUser)
  })

  it('setLoading toggles isLoading', () => {
    useAuthStore.getState().setLoading(false)
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('logout clears the user and both stored tokens', () => {
    localStorage.setItem('access_token', 'a')
    localStorage.setItem('refresh_token', 'b')
    useAuthStore.getState().setUser(testUser)

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })
})
