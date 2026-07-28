import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Groups from './Groups'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import type { User } from '../types'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const guestUser: User = {
  id: 1,
  email: 'guest-x@guest.trove.local',
  name: 'Guest',
  avatar_url: null,
  default_region: 'US',
  is_guest: true,
}

const regularUser: User = {
  id: 2,
  email: 'user@example.com',
  name: 'Test User',
  avatar_url: null,
  default_region: 'US',
  is_guest: false,
}

function renderGroups() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })
  })

  it('hides the create-group button and explains the restriction for guests', async () => {
    useAuthStore.setState({ user: guestUser, isLoading: false })
    renderGroups()

    expect(
      await screen.findByText(/guest accounts can't create or join groups/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('+ Create Group')).not.toBeInTheDocument()
  })

  it('shows the create-group button for regular users', async () => {
    useAuthStore.setState({ user: regularUser, isLoading: false })
    renderGroups()

    expect(await screen.findByText('+ Create Group')).toBeInTheDocument()
    expect(
      screen.queryByText(/guest accounts can't create or join groups/i),
    ).not.toBeInTheDocument()
  })
})
