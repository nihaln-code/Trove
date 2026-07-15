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

export const STATUS_BUTTONS: { status: WatchlistStatus; label: string }[] = [
  { status: 'want_to_watch', label: 'Want to Watch' },
  { status: 'watching',      label: 'Watching'      },
  { status: 'watched',       label: 'Watched'       },
]

export interface WatchlistItem {
  id: number
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  added_at: string
  status: WatchlistStatus
  rating: 1 | -1 | null
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
  available_on?: string[]
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

export interface GroupServiceItem {
  tmdb_provider_id: number
  provider_name: string
  provider_logo_path: string | null
}

export interface GroupServicesResponse {
  active: GroupServiceItem[]
  available: GroupServiceItem[]
  is_custom: boolean
}

export type GroupRole = 'owner' | 'member'

export interface GroupMember {
  user_id: number
  name: string
  email: string
  avatar_url: string | null
  role: GroupRole
  joined_at: string
}

export interface Group {
  id: number
  name: string
  invite_code: string
  owner_id: number
  created_at: string
  member_count: number
}

export interface GroupDetail extends Group {
  members: GroupMember[]
}

export interface GroupPreview {
  id: number
  name: string
  member_count: number
  already_member: boolean
}

export interface GroupRecommendationItem {
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  overview: string | null
  vote_average: number | null
  reason: string
  available_on: string[]
}

export interface GroupItemLiker {
  user_id: number
  name: string
}

export interface GroupWatchlistItem {
  id: number
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  added_at: string
  added_by_user_id: number
  added_by_name: string
  status: WatchlistStatus
  like_count: number
  dislike_count: number
  liked_by: GroupItemLiker[]
  my_rating: 1 | -1 | null
}

export interface ContentRatings {
  likes: number
  dislikes: number
}
