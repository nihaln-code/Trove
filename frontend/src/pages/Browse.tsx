import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../services/api'
import ContentCard from '../components/content/ContentCard'
import type { TMDBContent, WatchlistItem } from '../types'
import { RecommendationCardSkeleton } from '../components/ui/Skeletons'

export default function Browse() {
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie')
  const [genreId, setGenreId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { data: services } = useQuery({
    queryKey: ['streaming-services'],
    queryFn: () => api.get('/streaming-services').then((r) => r.data),
  })

  const { data: genres } = useQuery({
    queryKey: ['genres', mediaType],
    queryFn: () => api.get(`/content/genres?media_type=${mediaType}`).then((r) => r.data),
  })

  const { data: watchlistData } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: () => api.get('/watchlist').then((r) => r.data),
  })

  const isSearching = search.length > 0

  const browseQuery = useInfiniteQuery({
    queryKey: ['browse', mediaType, genreId],
    queryFn: ({ pageParam }) =>
      api
        .get('/content/browse', { params: { media_type: mediaType, genre_id: genreId, page: pageParam } })
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.results?.length > 0 ? allPages.length + 1 : undefined,
    enabled: !isSearching && (services?.length ?? 0) > 0,
  })

  const searchQuery = useInfiniteQuery({
    queryKey: ['search', search],
    queryFn: ({ pageParam }) =>
      api.get('/content/search', { params: { query: search, page: pageParam } }).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < (lastPage.total_pages ?? 1) ? allPages.length + 1 : undefined,
    enabled: isSearching,
  })

  const activeQuery = isSearching ? searchQuery : browseQuery
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = activeQuery

  const results: TMDBContent[] = (activeQuery.data?.pages ?? []).flatMap((p) => p.results ?? [])

  const seen = new Set<string>()
  const uniqueResults = results.filter((item) => {
    const key = `${item.id}-${item.media_type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect])

  // Live search: debounce so we don't fire a request on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(handle)
  }, [searchInput])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  function clearSearch() {
    setSearch('')
    setSearchInput('')
  }

  if (!services?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-trove-surface text-trove-muted">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-trove-text">No streaming services yet</h2>
        <p className="mb-6 text-sm text-trove-muted">Add your services to start browsing content</p>
        <Link
          to="/profile"
          className="cursor-pointer rounded-lg bg-trove-accent px-6 py-2.5 font-semibold text-white transition-colors hover:bg-trove-accent-hover"
        >
          Go to Profile
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-trove-text">Browse</h1>
        <p className="mt-0.5 text-sm text-trove-muted">
          {isSearching
            ? `Searching for "${search}"`
            : `${mediaType === 'movie' ? 'Movies' : 'TV Shows'} across your services`}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-3">
        {/* Row 1: search + type toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2 sm:flex-none">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-trove-muted"
                fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search movies & shows..."
                className="w-full rounded-lg border border-trove-border bg-trove-surface py-2 pl-9 pr-3 text-sm text-trove-text placeholder-trove-muted outline-none transition-colors focus:border-trove-accent sm:w-64"
              />
            </div>
            <button
              type="submit"
              className="cursor-pointer rounded-lg border border-trove-border bg-trove-surface p-2 text-trove-muted transition-colors hover:border-trove-accent hover:text-trove-text"
              aria-label="Search"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>
            {isSearching && (
              <button
                type="button"
                onClick={clearSearch}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-trove-border px-3 py-2 text-sm text-trove-muted transition-colors hover:text-trove-text"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </form>

          {!isSearching && (
            <div className="flex rounded-full border border-trove-border bg-trove-surface p-0.5">
              {(['movie', 'tv'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setMediaType(t); setGenreId(null) }}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                    mediaType === t
                      ? 'bg-trove-accent text-white shadow-sm'
                      : 'text-trove-muted hover:text-trove-text'
                  }`}
                >
                  {t === 'movie' ? 'Movies' : 'TV Shows'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Row 2: genre pills */}
        {!isSearching && genres && genres.length > 0 && (
          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setGenreId(null)}
              className={`flex-shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                !genreId
                  ? 'border-trove-accent bg-trove-accent text-white'
                  : 'border-trove-border bg-trove-surface text-trove-muted hover:border-trove-accent/50 hover:text-trove-text'
              }`}
            >
              All
            </button>
            {genres.map((g: { id: number; name: string }) => (
              <button
                key={g.id}
                onClick={() => setGenreId(g.id)}
                className={`flex-shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  genreId === g.id
                    ? 'border-trove-accent bg-trove-accent text-white'
                    : 'border-trove-border bg-trove-surface text-trove-muted hover:border-trove-accent/50 hover:text-trove-text'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <RecommendationCardSkeleton key={i} />)}
        </div>
      ) : uniqueResults.length === 0 ? (
        <div className="py-20 text-center text-trove-muted">No results found</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {uniqueResults.map((item) => (
              <ContentCard
                key={`${item.id}-${item.media_type}`}
                item={item}
                watchlistItems={watchlistData}
              />
            ))}
          </div>

          <div ref={sentinelRef} className="flex justify-center py-8">
            {isFetchingNextPage && (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
            )}
            {!hasNextPage && uniqueResults.length > 0 && (
              <p className="text-sm text-trove-muted">You've reached the end</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
