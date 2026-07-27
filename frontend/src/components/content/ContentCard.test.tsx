import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContentCard from './ContentCard'
import api from '../../services/api'
import type { TMDBContent, WatchlistItem } from '../../types'

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  TMDB_IMAGE: (path: string | null) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null),
}))

const baseItem: TMDBContent = {
  id: 550,
  title: 'Fight Club',
  poster_path: '/poster.jpg',
  overview: '',
  vote_average: 8.4,
  media_type: 'movie',
} as TMDBContent

function renderCard(watchlistItems: WatchlistItem[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ContentCard item={baseItem} watchlistItems={watchlistItems} />
    </QueryClientProvider>,
  )
}

describe('ContentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title and poster', () => {
    renderCard()
    expect(screen.getByText('Fight Club')).toBeInTheDocument()
    expect(screen.getByAltText('Fight Club')).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w342/poster.jpg',
    )
  })

  it('adds the item to the watchlist when a status button is clicked', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByText('Want to Watch'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/watchlist', expect.objectContaining({
        tmdb_id: 550,
        media_type: 'movie',
        status: 'want_to_watch',
      }))
    })
  })

  it('shows the current status as active', () => {
    renderCard([
      {
        id: 1,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/poster.jpg',
        added_at: new Date().toISOString(),
        status: 'watching',
        rating: null,
      },
    ])

    expect(screen.getByText('Watching').closest('button')).toHaveClass('bg-trove-accent')
  })

  it('removes the item when clicking its already-active status', async () => {
    const user = userEvent.setup()
    renderCard([
      {
        id: 1,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/poster.jpg',
        added_at: new Date().toISOString(),
        status: 'watching',
        rating: null,
      },
    ])

    await user.click(screen.getByText('Watching'))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/watchlist/1')
    })
  })
})
