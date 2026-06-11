export interface User {
  id: number
  email: string
  name: string
  avatar_url: string | null
  default_region: string
}

export interface StreamingService {
  id: number
  tmdb_provider_id: number
  provider_name: string
  provider_logo_path: string | null
  region_override: string | null
}

export type WatchlistStatus = 'want_to_watch' | 'watching' | 'watched'
export type MediaType = 'movie' | 'tv'

export interface WatchlistItem {
  id: number
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  added_at: string
  status: WatchlistStatus
}

export interface TMDBContent {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  overview: string
  vote_average: number
  release_date?: string
  first_air_date?: string
  media_type: MediaType
  genre_ids?: number[]
}

export interface TMDBProvider {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority: number
}

export interface RecommendationItem {
  tmdb_id: number
  media_type: string
  title: string
  poster_path: string | null
  overview: string | null
  vote_average: number | null
  reason: string
  available_on: string[]
}
